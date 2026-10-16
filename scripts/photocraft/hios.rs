//! HIOS-only web-shell adapter. The engine and upstream UI stay unchanged.
use photocraft_ui_egui::PhotocraftApp;
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

const MAX_BYTES: usize = 64 * 1024 * 1024;
struct Request {
    id: String,
    op: String,
    name: String,
    bytes: Vec<u8>,
}
#[derive(Default)]
struct Bridge {
    ctx: Option<egui::Context>,
    queue: Vec<Request>,
    replies: Vec<(String, Vec<u8>)>,
    status: String,
    font: Option<Vec<u8>>,
}
thread_local! { static BRIDGE: RefCell<Bridge> = RefCell::new(Bridge::default()); }

pub fn attach(ctx: &egui::Context) {
    BRIDGE.with(|b| b.borrow_mut().ctx = Some(ctx.clone()));
}

#[wasm_bindgen]
pub fn hios_status() -> String {
    BRIDGE.with(|b| b.borrow().status.clone())
}

#[wasm_bindgen]
pub fn hios_request(id: &str, op: &str, name: &str, bytes: &[u8]) -> Result<(), JsValue> {
    if id.len() > 128 || name.len() > 512 || bytes.len() > MAX_BYTES {
        return Err(JsValue::from_str("请求超过 64 MB 限制"));
    }
    if !matches!(
        op,
        "open" | "import-layer" | "export" | "snapshot" | "saved" | "theme" | "locale" | "font"
    ) {
        return Err(JsValue::from_str("不支持的 PhotoCraft 操作"));
    }
    BRIDGE.with(|b| {
        let mut b = b.borrow_mut();
        if b.queue.len() >= 16 {
            return Err(JsValue::from_str("PhotoCraft 正忙，请稍后重试"));
        }
        b.queue.push(Request {
            id: id.into(),
            op: op.into(),
            name: name.into(),
            bytes: bytes.to_vec(),
        });
        if let Some(ctx) = &b.ctx {
            ctx.request_repaint();
        }
        Ok(())
    })
}

#[wasm_bindgen]
pub fn hios_take_replies() -> js_sys::Array {
    let replies = BRIDGE.with(|b| std::mem::take(&mut b.borrow_mut().replies));
    let result = js_sys::Array::new();
    for (meta, bytes) in replies {
        let entry = js_sys::Array::new();
        entry.push(&JsValue::from_str(&meta));
        entry.push(&js_sys::Uint8Array::from(bytes.as_slice()));
        result.push(&entry);
    }
    result
}

fn reply(meta: serde_json::Value, bytes: Vec<u8>) {
    BRIDGE.with(|b| {
        let mut b = b.borrow_mut();
        if b.replies.len() < 32 {
            b.replies.push((meta.to_string(), bytes));
        }
    });
}

fn perform(
    app: &mut PhotocraftApp,
    ctx: &egui::Context,
    r: &Request,
) -> Result<(serde_json::Value, Vec<u8>), String> {
    match r.op.as_str() {
        "import-layer" => {
            if r.bytes.is_empty() {
                return Err("输入文件为空".into());
            }
            if app.session.active().is_none() {
                let warnings = app.open_automation_bytes(&r.name, &r.bytes)?;
                Ok((serde_json::json!({"warnings": warnings}), Vec::new()))
            } else {
                // Use the engine's undoable Place command, not Open (a new tab).
                // A plain pixel layer can be painted immediately. Centre it and fit
                // oversized inputs without changing any existing layer or canvas.
                let result = photocraft_engine::file_cmds::place_bytes(
                    &mut app.session,
                    &r.name,
                    r.bytes.clone(),
                    None,
                    &serde_json::json!({"smartObject": false, "fit": true}),
                )
                .map_err(|e| e.to_string())?;
                Ok((result, Vec::new()))
            }
        }
        "open" => {
            if r.bytes.is_empty() {
                return Err("输入文件为空".into());
            }
            let warnings = app.open_automation_bytes(&r.name, &r.bytes)?;
            Ok((serde_json::json!({"warnings": warnings}), Vec::new()))
        }
        "font" => {
            BRIDGE.with(|b| b.borrow_mut().font = Some(r.bytes.clone()));
            // The same font also backs editable CJK text layers, not just egui labels.
            photocraft_ui_egui::served_fonts::install(
                app,
                vec![("Noto Sans SC".into(), r.bytes.clone())],
            );
            Ok((serde_json::json!({}), Vec::new()))
        }
        "locale" => {
            // Upstream's WASM Auto locale has no OS resolver. Use the HIOS page language,
            // without overriding a language explicitly selected in PhotoCraft preferences.
            let code = photocraft_ui_egui::i18n::Lang::from_pref(&r.name)
                .code()
                .to_string();
            if app.session.prefs().interface.language == "auto" {
                app.session.edit_prefs(|p| p.interface.language = code);
            }
            Ok((serde_json::json!({}), Vec::new()))
        }
        "theme" => {
            use photocraft_ui_egui::theme::ThemeKind;
            app.set_theme(
                ctx,
                if r.name == "light" {
                    ThemeKind::ProLightGray
                } else {
                    ThemeKind::ProMedium
                },
            );
            Ok((serde_json::json!({}), Vec::new()))
        }
        "saved" => {
            // Acknowledge only AFTER the HIOS disk write and only for the exact snapshot.
            // A user may have switched tabs or edited again while the host was saving.
            if let Some(active) = app.session.active_mut() {
                if r.name == format!("{}:{}", active.doc.id.0, active.revision) {
                    active.saved_revision = active.revision;
                }
            }
            Ok((serde_json::json!({}), Vec::new()))
        }
        "export" | "snapshot" => {
            let active = app.session.active().ok_or("请先新建或打开一个文档")?;
            let format = if r.op == "snapshot" {
                "pcraft"
            } else {
                r.name.as_str()
            };
            if !matches!(format, "png" | "jpg" | "webp" | "psd" | "pcraft") {
                return Err("不支持的导出格式".into());
            }
            let output = photocraft_io::export(&active.doc, format, &Default::default())
                .map_err(|e| e.to_string())?;
            if output.bytes.len() > MAX_BYTES {
                return Err("文档超过 64 MB，请使用 PhotoCraft 文件菜单另存到本机".into());
            }
            let name = std::path::Path::new(&active.doc.name)
                .file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or("PhotoCraft");
            Ok((
                serde_json::json!({"name": format!("{name}.{format}"), "format": format,
                "width": active.doc.size.width, "height": active.doc.size.height,
                "revision": active.revision, "documentId": active.doc.id.0.to_string(), "warnings": output.warnings}),
                output.bytes,
            ))
        }
        _ => Err("不支持的操作".into()),
    }
}

pub fn pump(app: &mut PhotocraftApp, ctx: &egui::Context) {
    let queue = BRIDGE.with(|b| std::mem::take(&mut b.borrow_mut().queue));
    for r in queue {
        match perform(app, ctx, &r) {
            Ok((meta, bytes)) => reply(
                serde_json::json!({"requestId":r.id,"op":r.op,"result":meta}),
                bytes,
            ),
            Err(error) => reply(
                serde_json::json!({"requestId":r.id,"op":r.op,"error":error}),
                Vec::new(),
            ),
        }
    }
    // PhotoCraft rebuilds its UI font definitions on a language/scale change. Reattach
    // our web fallback to EVERY family (including medium/semibold), not just body text.
    BRIDGE.with(|b| {
        let b = b.borrow();
        if let Some(bytes) = &b.font {
            if !ctx.fonts(|f| f.definitions().font_data.contains_key("hios-cjk")) {
                use egui::epaint::text::{FontInsert, FontPriority, InsertFontFamily};
                let families = ctx
                    .fonts(|f| f.definitions().families.keys().cloned().collect::<Vec<_>>())
                    .into_iter()
                    .map(|family| InsertFontFamily {
                        family,
                        priority: FontPriority::Lowest,
                    })
                    .collect();
                ctx.add_font(FontInsert {
                    name: "hios-cjk".into(),
                    data: egui::FontData::from_owned(bytes.clone()),
                    families,
                });
                ctx.request_repaint();
            }
        }
    });
    let document = app.session.active().map(|a| serde_json::json!({
        "id":a.doc.id.0.to_string(),"name":a.doc.name,"revision":a.revision,"width":a.doc.size.width,"height":a.doc.size.height,
        "layers":a.doc.layers.len(),"documents":app.session.documents().len()
    }));
    BRIDGE.with(|b| {
        b.borrow_mut().status = serde_json::json!({"ready":true,"document":document}).to_string()
    });
}
