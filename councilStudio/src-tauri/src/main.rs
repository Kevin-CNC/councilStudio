// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WSLg's Mesa/Zink EGL stack fails to pick a GPU device, which breaks
    // WebKitGTK's DMA-BUF compositing path. Force the fallback renderer.
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");

    councilstudio_lib::run()
}
