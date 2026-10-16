//! HIOS-only web-shell adapter. The engine and upstream UI stay unchanged.
use photocraft_algo::resample::{Resample, resize_surface_in_canvas, translate_surface};
use photocraft_color::{ColorMode, PixelFormat, SampleType};
use photocraft_doc::{Document, Layer, LayerContent, LayerMask};
use photocraft_geom::Size;
use photocraft_raster::Surface;
use photocraft_ui_egui::PhotocraftApp;
use std::cell::RefCell;
use wasm_bindgen::prelude::*;

#[derive(Clone)]
struct Capture {
    meta: serde_json::Value,
    mask: Option<Surface>,
}
thread_local! { static CAPTURES: RefCell<std::collections::HashMap<String, Capture>> = RefCell::new(Default::default()); }

fn surface_png(surface: Surface, w: u32, h: u32) -> Result<Vec<u8>, String> {
    let mut d = Document::new("AI范围", Size::new(w, h), ColorMode::Rgb, SampleType::U8);
    d.layers = vec![Layer::new("范围", LayerContent::Raster(surface))];
    photocraft_io::export(&d, "png", &Default::default())
        .map(|r| r.bytes)
        .map_err(|e| e.to_string())
}
fn ai_op(app: &mut PhotocraftApp, r: &Request) -> Result<(serde_json::Value, Vec<u8>), String> {
    let p: serde_json::Value = serde_json::from_str(&r.name).map_err(|e| e.to_string())?;
    let token = p["token"]
        .as_str()
        .filter(|s| s.len() <= 128)
        .ok_or("无效的范围标识")?
        .to_string();
    if r.op == "ai-release" {
        CAPTURES.with(|c| c.borrow_mut().remove(&token));
        return Ok((serde_json::json!({}), vec![]));
    }
    if r.op == "ai-context" {
        let a = app.session.active().ok_or("请先打开或新建文档")?;
        let mut d = (*a.doc).clone();
        let scope = p["scope"].as_str().unwrap_or("canvas");
        let bounds = match scope {
            "selection" => d
                .selection
                .as_ref()
                .ok_or("请先使用选区工具创建选区")?
                .content_bounds()
                .intersect(&d.bounds()),
            "layer" => {
                let layer = d
                    .layer(a.active_layer.ok_or("请先选择一个图层")?)
                    .ok_or("当前图层不存在")?
                    .clone();
                let b = photocraft_compose::composite_bounds(&layer, d.bounds())
                    .ok_or("当前图层为空")?
                    .intersect(&d.bounds());
                d.layers = vec![layer];
                b
            }
            "canvas" => d.bounds(),
            _ => return Err("未知的 AI 范围".into()),
        };
        if bounds.is_empty() {
            return Err("选定范围为空".into());
        }
        if u64::from(bounds.width()) * u64::from(bounds.height()) > 16_777_216 {
            return Err("AI 范围超过 1600 万像素，请缩小范围".into());
        }
        let mask = if scope == "selection" {
            d.selection.clone()
        } else {
            None
        };
        d.selection = None;
        let surface =
            photocraft_compose::composite_to_surface(&d, bounds, PixelFormat::RGBA8, None);
        let bytes = surface_png(
            translate_surface(&surface, -bounds.x0, -bounds.y0),
            bounds.width(),
            bounds.height(),
        )?;
        let meta = serde_json::json!({"token":token,"scope":scope,"documentId":a.doc.id.0.to_string(),"canvasWidth":d.size.width,"canvasHeight":d.size.height,"bounds":[bounds.x0,bounds.y0,bounds.width(),bounds.height()],"hasMask":mask.is_some()});
        CAPTURES.with(|c| {
            let mut c = c.borrow_mut();
            if c.len() >= 8 {
                return Err("AI 范围缓存已满，请先处理现有任务".to_string());
            }
            c.insert(
                token,
                Capture {
                    meta: meta.clone(),
                    mask,
                },
            );
            Ok(())
        })?;
        return Ok((meta, bytes));
    }
    if r.op == "ai-restore" {
        let b = &p["bounds"];
        let w = b[2]
            .as_u64()
            .filter(|v| *v > 0 && *v <= 16384)
            .ok_or("无效的范围宽度")? as u32;
        let h = b[3]
            .as_u64()
            .filter(|v| *v > 0 && *v <= 16384)
            .ok_or("无效的范围高度")? as u32;
        if u64::from(w) * u64::from(h) > 16_777_216 {
            return Err("范围过大".into());
        }
        let mask = if p["hasMask"] == true {
            let imported =
                photocraft_io::import("mask.png", &r.bytes).map_err(|e| e.to_string())?;
            if imported.document.size != Size::new(w, h) {
                return Err("保存的选区蒙版尺寸不匹配".into());
            }
            let rgba = photocraft_compose::flatten_to_surface(
                &imported.document,
                PixelFormat::RGBA8,
                None,
            );
            let mut s = Surface::new(PixelFormat::GRAY8);
            let x = b[0].as_i64().ok_or("无效范围坐标")? as i32;
            let y = b[1].as_i64().ok_or("无效范围坐标")? as i32;
            for yy in 0..h as i32 {
                for xx in 0..w as i32 {
                    s.write_pixel(x + xx, y + yy, &[rgba.sample_channel(xx, yy, 3)]);
                }
            }
            Some(s)
        } else {
            None
        };
        CAPTURES.with(|c| c.borrow_mut().insert(token, Capture { meta: p, mask }));
        return Ok((serde_json::json!({}), vec![]));
    }
    let capture = CAPTURES
        .with(|c| c.borrow().get(&token).cloned())
        .ok_or("AI 范围已失效，请重新获取范围")?;
    let b = &capture.meta["bounds"];
    let x = b[0].as_i64().unwrap_or(0) as i32;
    let y = b[1].as_i64().unwrap_or(0) as i32;
    let w = b[2].as_u64().unwrap_or(0) as u32;
    let h = b[3].as_u64().unwrap_or(0) as u32;
    if r.op == "ai-mask" {
        let mut s = Surface::new(PixelFormat::RGBA8);
        if let Some(mask) = &capture.mask {
            for yy in 0..h as i32 {
                for xx in 0..w as i32 {
                    s.write_pixel(
                        xx,
                        yy,
                        &[1.0, 1.0, 1.0, mask.sample_channel(x + xx, y + yy, 0)],
                    );
                }
            }
        }
        return Ok((serde_json::json!({}), surface_png(s, w, h)?));
    }
    let target = app
        .session
        .documents()
        .iter()
        .position(|a| a.doc.id.0.to_string() == capture.meta["documentId"].as_str().unwrap_or(""))
        .ok_or("原文档已关闭；可将结果作为新文档打开")?;
    let d = &app.session.documents()[target].doc;
    if d.size.width as u64 != capture.meta["canvasWidth"].as_u64().unwrap_or(0)
        || d.size.height as u64 != capture.meta["canvasHeight"].as_u64().unwrap_or(0)
    {
        return Err("原画布尺寸已改变；可将结果作为新文档打开".into());
    }
    let psd = r.op == "ai-import-psd";
    // A document snapshot may already contain the result when its state ACK was
    // interrupted by a reload. The stable job marker makes re-application idempotent.
    let result_name = format!("{} · {}", if psd { "AI分层" } else { "AI生成" }, token);
    if d.walk().iter().any(|(_, _, l)| l.name == result_name) {
        return Ok((serde_json::json!({"alreadyApplied":true}), vec![]));
    }
    if psd && !r.bytes.starts_with(b"8BPS") {
        return Err("模型未返回有效的 PSD 文件".into());
    }
    let mut imported =
        photocraft_io::import(if psd { "AI分层.psd" } else { "AI结果.png" }, &r.bytes)
            .map_err(|e| e.to_string())?;
    if psd {
        if imported.document.walk().len() < 2 {
            return Err("返回的 PSD 没有多个独立图层，可作为新文档检查".into());
        }
        if imported.document.size != Size::new(w, h) {
            return Err("PSD 尺寸与原范围不一致；可作为新文档打开，避免图层错位".into());
        }
        let layers = std::mem::take(&mut imported.document.layers);
        imported.document.layers = vec![Layer::group(result_name, layers)];
    } else {
        let s =
            photocraft_compose::flatten_to_surface(&imported.document, PixelFormat::RGBA8, None);
        let s = resize_surface_in_canvas(
            &s,
            f64::from(w) / f64::from(imported.document.size.width),
            f64::from(h) / f64::from(imported.document.size.height),
            Resample::Bicubic,
            imported.document.bounds(),
        );
        imported.document =
            Document::new("AI结果", Size::new(w, h), ColorMode::Rgb, SampleType::U8);
        imported.document.layers = vec![Layer::new(result_name, LayerContent::Raster(s))];
    }
    if let Some(mask) = &capture.mask {
        imported.document.layers[0].mask = Some(LayerMask {
            surface: translate_surface(mask, -x, -y),
            ..LayerMask::hide_all()
        });
    }
    let ids: Vec<_> = imported.document.layers.iter().map(|l| l.id.0).collect();
    let temp = app.session.add_document(imported.document, None);
    let result = app
        .session
        .execute(
            "layer.copyToDocument",
            serde_json::json!({"source":temp,"document":target,"layers":ids,"offset":[x,y]}),
        )
        .map_err(|e| e.to_string());
    app.session.close(temp);
    app.session.set_active(target);
    app.sync_views();
    result?;
    Ok((serde_json::json!({"warnings":imported.warnings}), vec![]))
}

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
    if id.len() > 128 || name.len() > 8192 || bytes.len() > MAX_BYTES {
        return Err(JsValue::from_str("请求超过 64 MB 限制"));
    }
    if !matches!(
        op,
        "open"
            | "import-layer"
            | "export"
            | "snapshot"
            | "saved"
            | "theme"
            | "locale"
            | "font"
            | "ai-context"
            | "ai-mask"
            | "ai-restore"
            | "ai-apply-image"
            | "ai-import-psd"
            | "ai-release"
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
    if r.op.starts_with("ai-") {
        return ai_op(app, r);
    }
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
