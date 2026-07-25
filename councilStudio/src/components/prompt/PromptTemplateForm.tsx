import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/stores/appStore";
import type { PromptTemplate } from "@/types";

const CATEGORIES = ["general", "brainstorming", "analysis", "review", "custom"];

interface PromptTemplateFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: PromptTemplate | null;
}

export function PromptTemplateForm({ open, onOpenChange, template }: PromptTemplateFormProps) {
  const savePromptTemplate = useAppStore((s) => s.savePromptTemplate);
  const isEditing = !!template;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description);
      setPrompt(template.prompt);
      setCategory(template.category);
    } else {
      setName("");
      setDescription("");
      setPrompt("");
      setCategory("general");
    }
  }, [template, open]);

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) return;
    setSaving(true);
    try {
      await savePromptTemplate({
        id: template?.id,
        name,
        description,
        prompt,
        category,
      });
      onOpenChange(false);
    } catch {
      // Error is handled by the store (sets error state)
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Prompt Template" : "New Prompt Template"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this reusable prompt template"
              : "Save a prompt you'd like to reuse across council runs"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              placeholder="e.g., Feature brainstorm"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              placeholder="What this template is for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              placeholder="Write the prompt template..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[140px] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !prompt.trim() || saving}>
            {isEditing ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
