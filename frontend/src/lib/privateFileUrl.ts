export function isPrivateFileUrl(value:string|null|undefined):value is string {
  return typeof value==='string'&&/^\/api\/private-files\/[a-f0-9-]{36}\/[a-f0-9-]{36}(?:\?link=[A-Za-z0-9_.%-]+)?$/i.test(value)&&value.length<=2400;
}
