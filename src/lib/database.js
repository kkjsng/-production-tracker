import { supabase } from "./supabase";

// ── Users ──
export async function getUsers() {
  const { data } = await supabase.from("users").select("*").order("created_at");
  return data || [];
}
export async function createUser(user) {
  const { data } = await supabase.from("users").insert(user).select().single();
  return data;
}

// ── Masters ──
export async function getColorMasters() {
  const { data } = await supabase.from("color_masters").select("*").order("code");
  return data || [];
}
export async function getSizeMasters() {
  const { data } = await supabase.from("size_masters").select("*").order("code");
  return data || [];
}
export async function upsertColorMasters(colors) {
  await supabase.from("color_masters").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (colors.length > 0) {
    await supabase.from("color_masters").insert(colors.map(c => ({ code: c.code, name: c.name })));
  }
}
export async function upsertSizeMasters(sizes) {
  await supabase.from("size_masters").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (sizes.length > 0) {
    await supabase.from("size_masters").insert(sizes.map(s => ({ code: s.code, name: s.name })));
  }
}

// ── Items ──
export async function getItems() {
  const { data } = await supabase.from("items").select("*").order("created_at");
  return data || [];
}
export async function createItem(item) {
  const { data } = await supabase.from("items").insert(item).select().single();
  return data;
}
export async function updateItem(id, updates) {
  const { data } = await supabase.from("items").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  return data;
}

// ── Color/Size/Qty ──
export async function getItemColorSizes(itemId) {
  const { data } = await supabase.from("item_color_sizes").select("*").eq("item_id", itemId);
  return data || [];
}
export async function getAllColorSizes() {
  const { data } = await supabase.from("item_color_sizes").select("*");
  return data || [];
}
export async function setItemColorSizes(itemId, rows) {
  await supabase.from("item_color_sizes").delete().eq("item_id", itemId);
  if (rows.length > 0) {
    await supabase.from("item_color_sizes").insert(rows.map(r => ({ item_id: itemId, color_code: r.color_code || r.colorCode, size_code: r.size_code || r.sizeCode, qty: r.qty || 0 })));
  }
}

// ── Stages ──
export async function getItemStages(itemId) {
  const { data } = await supabase.from("item_stages").select("*").eq("item_id", itemId);
  return data || [];
}
export async function getAllStages() {
  const { data } = await supabase.from("item_stages").select("*");
  return data || [];
}
export async function upsertStage(itemId, stageKey, checked, userId) {
  const { data } = await supabase.from("item_stages").upsert({ item_id: itemId, stage_key: stageKey, checked, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "item_id,stage_key" }).select().single();
  return data;
}
export async function initStages(itemId, stageKeys) {
  const rows = stageKeys.map(key => ({ item_id: itemId, stage_key: key, checked: false }));
  await supabase.from("item_stages").insert(rows);
}

// ── Chat ──
export async function getChatMessages(itemId) {
  const { data } = await supabase.from("chat_messages").select("*, users(name, role)").eq("item_id", itemId).order("created_at");
  return data || [];
}
export async function sendChatMessage(itemId, userId, message) {
  const { data } = await supabase.from("chat_messages").insert({ item_id: itemId, user_id: userId, message }).select("*, users(name, role)").single();
  return data;
}

// ── Activity Logs ──
export async function getLogs() {
  const { data } = await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(100);
  return data || [];
}
export async function addLog(log) {
  await supabase.from("activity_logs").insert(log);
}

// ── Files ──
export async function getItemFiles(itemId) {
  const { data } = await supabase.from("item_files").select("*").eq("item_id", itemId).order("created_at");
  return data || [];
}
export async function uploadFile(itemId, file, userId) {
  const path = `${itemId}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage.from("item-files").upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from("item-files").getPublicUrl(path);
  const record = { item_id: itemId, file_name: file.name, file_url: urlData.publicUrl, file_type: file.type, file_size: file.size, uploaded_by: userId };
  const { data } = await supabase.from("item_files").insert(record).select().single();
  return data;
}
export async function deleteFile(fileId, fileUrl) {
  const path = fileUrl.split("/item-files/")[1];
  if (path) await supabase.storage.from("item-files").remove([path]);
  await supabase.from("item_files").delete().eq("id", fileId);
}

// ── Image upload ──
export async function uploadItemImage(itemId, file) {
  const path = `images/${itemId}_${Date.now()}`;
  const { error } = await supabase.storage.from("item-files").upload(path, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from("item-files").getPublicUrl(path);
  await updateItem(itemId, { image_url: urlData.publicUrl });
  return urlData.publicUrl;
}
