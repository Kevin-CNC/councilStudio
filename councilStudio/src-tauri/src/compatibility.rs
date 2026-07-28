use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct OpenRouterModelInfo {
    architecture: Option<Architecture>,
}

#[derive(Deserialize)]
struct Architecture {
    #[serde(default)]
    input_modalities: Vec<String>,
    #[serde(default)]
    output_modalities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberCompatibilityCheck {
    pub persona_id: String,
    pub persona_name: String,
    pub provider: String,
    pub model: String,
    pub compatible: bool,
    pub issues: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityCheckRequest {
    pub members: Vec<ModelCompatibilityInput>,
    #[serde(default)]
    pub required_input_modalities: Vec<String>,
    #[serde(default)]
    pub required_output_modalities: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCompatibilityInput {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityCheckResult {
    pub checks: Vec<MemberCompatibilityCheck>,
    pub incompatible_count: usize,
    pub failed_requests_count: usize,
}

fn normalize_model_id(provider: &str, model: &str) -> Option<String> {
    match provider {
        "anthropic" | "openai" => Some(format!("{provider}/{model}")),
        "openrouter" => Some(model.to_string()),
        _ => None,
    }
}

pub async fn run_compatibility_check(
    request: CompatibilityCheckRequest,
) -> Result<CompatibilityCheckResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let mut checks = Vec::new();
    let mut failed_count = 0usize;

    for member in &request.members {
        let model_id = normalize_model_id(&member.provider, &member.model);
        let mut issues = Vec::new();

        match model_id {
            None => {
                issues.push(format!(
                    "Local provider '{}' — model '{}' cannot be checked via OpenRouter. Verify manually that it supports text input and output.",
                    member.provider, member.model
                ));
                failed_count += 1;
            }
            Some(ref id) => {
                let url = format!("https://openrouter.ai/api/v1/model/{id}");
                match client.get(&url).send().await {
                    Err(e) => {
                        issues.push(format!("Failed to reach OpenRouter: {e}"));
                        failed_count += 1;
                    }
                    Ok(resp) if !resp.status().is_success() => {
                        let status = resp.status();
                        issues.push(format!(
                            "OpenRouter returned HTTP {status} for model '{id}'"
                        ));
                        failed_count += 1;
                    }
                    Ok(resp) => match resp.json::<OpenRouterModelInfo>().await {
                        Err(e) => {
                            issues.push(format!("Failed to parse model info: {e}"));
                            failed_count += 1;
                        }
                        Ok(info) => {
                            let empty: Vec<String> = Vec::new();
                            let arch = info.architecture.as_ref();
                            let input_mods = arch.map(|a| &a.input_modalities).unwrap_or(&empty);
                            let output_mods = arch.map(|a| &a.output_modalities).unwrap_or(&empty);

                            for req_input in &request.required_input_modalities {
                                let normalized = req_input.to_lowercase();
                                if !input_mods.iter().any(|m| m.to_lowercase() == normalized) {
                                    issues.push(format!(
                                        "Model does not support '{}' input (supports: {:?})",
                                        req_input, input_mods
                                    ));
                                }
                            }

                            for req_output in &request.required_output_modalities {
                                let normalized = req_output.to_lowercase();
                                if !output_mods.iter().any(|m| m.to_lowercase() == normalized) {
                                    issues.push(format!(
                                        "Model does not support '{}' output (supports: {:?})",
                                        req_output, output_mods
                                    ));
                                }
                            }
                        }
                    },
                }
            }
        }

        checks.push(MemberCompatibilityCheck {
            persona_id: member.id.clone(),
            persona_name: member.name.clone(),
            provider: member.provider.clone(),
            model: member.model.clone(),
            compatible: issues.is_empty(),
            issues,
        });
    }

    let incompatible_count = checks.iter().filter(|c| !c.compatible).count();

    Ok(CompatibilityCheckResult {
        checks,
        incompatible_count,
        failed_requests_count: failed_count,
    })
}
