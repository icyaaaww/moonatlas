// A single opt-in draft per application path. Revision checks prevent silent
// overwrites when two tabs edit the same saved workspace.
export class DraftConflict extends Error {
  constructor(){super('本机草稿已被另一个窗口修改。自动保存已暂停，请重新检查草稿。');this.name='DraftConflict';}
}
export class LocalDraft {
  constructor(factory,slot){this.factory=factory;this.slot=slot;this.opened=null;}
  open(){
    if(!this.factory)return Promise.reject(new Error('当前浏览器不支持本机草稿，请下载项目文件保存。'));
    if(this.opened)return this.opened;
    this.opened=new Promise((resolve,reject)=>{
      const request=this.factory.open('moonatlas-local',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts');};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.opened=null;};resolve(db);};
      request.onerror=()=>{this.opened=null;reject(new Error('无法打开本机草稿存储，请检查浏览器存储权限。'));};
      request.onblocked=()=>{this.opened=null;reject(new Error('本机草稿存储被其他窗口占用，请关闭旧窗口后重试。'));};
    });return this.opened;
  }
  async read(){
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readonly');const req=tx.objectStore('drafts').get(this.slot);let record=null;
      req.onsuccess=()=>{record=req.result || null;};
      tx.oncomplete=()=>resolve(record);tx.onabort=tx.onerror=()=>reject(new Error('读取本机草稿失败'));
    });
  }
  async change(expected,record){
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts','readwrite');const store=tx.objectStore('drafts');const req=store.get(this.slot);let conflict=false;
      req.onsuccess=()=>{
        if((req.result?.revision || null)!==expected){conflict=true;tx.abort();return;}
        try{if(record)store.put(record,this.slot);else store.delete(this.slot);}
        catch{tx.abort();}
      };
      tx.oncomplete=()=>resolve(record);
      tx.onabort=tx.onerror=()=>reject(conflict?new DraftConflict():new Error('本机保存失败（存储空间或权限不可用），请下载项目文件备份。'));
    });
  }
  save(project,expected){return this.change(expected,{format:'moonatlas-draft',revision:crypto.randomUUID(),updatedAt:new Date().toISOString(),project});}
  remove(expected){return this.change(expected,null);}
}

// Serialize writes. Stop/clear always waits for queued writes; failures disable
// the queue so a later callback cannot overwrite or falsely report success.
export class DraftWriter {
  constructor(store,onStatus){this.store=store;this.onStatus=onStatus;this.enabled=false;this.revision=null;this.generation=0;this.tail=Promise.resolve();this.sequence=0;this.savedSequence=0;}
  enable(revision=null){this.enabled=true;this.revision=revision;this.generation++;}
  enqueue(project){
    if(!this.enabled)return this.tail;
    const generation=this.generation,sequence=++this.sequence;
    const snapshot=structuredClone(project);
    this.onStatus('pending');
    const work=this.tail.then(async()=>{
      if(!this.enabled || generation!==this.generation)return;
      try{
        const record=await this.store.save(snapshot,this.revision);this.revision=record.revision;this.savedSequence=sequence;
        if(sequence===this.sequence && this.enabled && generation===this.generation)this.onStatus('saved',record);
      }catch(error){this.enabled=false;this.generation++;this.onStatus('error',error);throw error;}
    });
    this.tail=work.catch(()=>{});return work;
  }
  async stop(){this.enabled=false;this.generation++;await this.tail;}
  async clear(){await this.stop();await this.store.remove(this.revision);this.revision=null;this.onStatus('off');}
}
