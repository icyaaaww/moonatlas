import {parseProject,projectJSON} from './project.mjs';
// Canonical content includes all supported project data, but no runtime state.
export function canonicalProject(project) {return JSON.stringify(parseProject(projectJSON(project)));}
async function digest(project) {
  if(!globalThis.crypto?.subtle)throw new Error('当前环境不支持备份校验，请使用现代浏览器打开离线 HTML 或本机地址。仍可通过导出分享 HTML 保存资料。');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalProject(project)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function backupJSON(project) {
  const p=parseProject(projectJSON(project));
  return JSON.stringify({...p,backup:{version:1,algorithm:'SHA-256',createdAt:new Date().toISOString(),digest:await digest(p)}},null,2);
}
export async function readBackup(text) {
  const project=parseProject(text),raw=JSON.parse(text);
  if(Object.hasOwn(raw,'backup')){
    const b=raw.backup;
    if(!b || b.version!==1 || b.algorithm!=='SHA-256' || typeof b.createdAt!=='string' || !Number.isFinite(Date.parse(b.createdAt)) || typeof b.digest!=='string' || !/^[a-f0-9]{64}$/.test(b.digest))throw new Error('备份校验信息无效，请选择完整的原始备份文件。');
    if(await digest(project)!==b.digest)throw new Error('备份内容与校验值不一致，可能已被修改或损坏；当前项目未被替换。');
    return {project,verified:true,createdAt:b.createdAt};
  }
  return {project,verified:false,createdAt:null};
}
