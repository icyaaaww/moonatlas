// Session-only snapshots. Exported projects never contain undo history.
export class ProjectHistory {
  constructor({limit=20,maxChars=16000000}={}) { this.limit=limit;this.maxChars=maxChars;this.past=[];this.future=[]; }
  clear() { this.past=[];this.future=[]; }
  push(state) {
    const text=JSON.stringify(state);
    this.future=[];
    if(text.length>this.maxChars){this.past=[];return false;}
    this.past.push(text);this.trim();return true;
  }
  trim() {
    while(this.past.length+this.future.length>this.limit || [...this.past,...this.future].reduce((n,s)=>n+s.length,0)>this.maxChars) {
      if(this.past.length)this.past.shift();else this.future.shift();
    }
  }
  undo(current) {
    if(!this.past.length)return null;
    const previous=JSON.parse(this.past.pop());this.future.push(JSON.stringify(current));this.trim();return previous;
  }
  redo(current) {
    if(!this.future.length)return null;
    const next=JSON.parse(this.future.pop());this.past.push(JSON.stringify(current));this.trim();return next;
  }
}
