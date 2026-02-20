export function cloneSerializable(value){
  return JSON.parse(JSON.stringify(value));
}
