export type Draft = { step:number; values:Record<string,string>; files:Record<string,File> }

export async function organizationDraft(user:string, value?:Draft|null):Promise<Draft|undefined> {
  const db = await new Promise<IDBDatabase>((resolve,reject)=>{
    const req=indexedDB.open('sofia-organization-drafts',1)
    req.onupgradeneeded=()=>req.result.createObjectStore('drafts')
    req.onsuccess=()=>resolve(req.result)
    req.onerror=()=>reject(req.error)
  })
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts',value===undefined?'readonly':'readwrite')
      const store=tx.objectStore('drafts')
      const req=value===undefined?store.get(user):value===null?store.delete(user):store.put(value,user)
      tx.oncomplete=()=>resolve(value===undefined?req.result:undefined)
      tx.onabort=()=>reject(tx.error)
    })
  } finally {db.close()}
}
