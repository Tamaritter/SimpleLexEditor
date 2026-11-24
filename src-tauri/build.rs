fn main() {
    println!("cargo:rerun-if-changed=app.rc");
    println!("cargo:rerun-if-changed=app.manifest");
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("Tauri build configuration failed");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // Unit-test executables also need Common Controls v6, not just the app binary.
        embed_resource::compile_for_everything("app.rc", embed_resource::NONE)
            .manifest_required()
            .expect("Windows application manifest failed");
    }
}
