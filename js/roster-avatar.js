/* RA'AZ BORG — private photo management. Never store athlete photos in the public bucket. */
(() => {
  'use strict';
  const BUCKET='roster-avatars', MAX_SIZE=2*1024*1024;
  const formats={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  function validate(file) {
    if (!file) throw new Error('No photo selected');
    if (!Object.prototype.hasOwnProperty.call(formats,file.type))
      throw new Error('Use a JPG, PNG or WebP photo.');
    if (file.size<=0 || file.size>MAX_SIZE)
      throw new Error('Choose an image smaller than 2 MB.');
  }
  async function display(client,path) {
    if (!path) return null;
    const {data,error}=await client.storage.from(BUCKET).createSignedUrl(path,600);
    if (error || !data?.signedUrl) throw error||new Error('Photo could not be loaded');
    return data.signedUrl;
  }
  async function upload(client,owner,file,oldPath) {
    validate(file);
    if (!owner?.id) throw new Error('Sign in required');
    const path=owner.id+'/'+crypto.randomUUID()+'.'+formats[file.type];
    const bucket=client.storage.from(BUCKET);
    const {error:uploadError}=await bucket.upload(path,file,{
      upsert:false,contentType:file.type,cacheControl:'600'
    });
    if(uploadError)throw uploadError;
    const {error:saveError}=await client.rpc('rb_set_roster_avatar',{p_path:path});
    if(saveError) {
      await bucket.remove([path]).catch(()=>{});
      throw saveError;
    }
    if(oldPath && oldPath!==path && oldPath.startsWith(owner.id+'/')) {
      await bucket.remove([oldPath]).catch(()=>{});
    }
    return path;
  }
  async function remove(client,owner,oldPath) {
    if(!owner?.id)throw new Error('Sign in required');
    const {error}=await client.rpc('rb_set_roster_avatar',{p_path:null});
    if(error)throw error;
    if(oldPath && oldPath.startsWith(owner.id+'/'))
      await client.storage.from(BUCKET).remove([oldPath]).catch(()=>{});
  }
  window.RaazAvatar=Object.freeze({upload,display,remove,validate,maxSize:MAX_SIZE});
})();