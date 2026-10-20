/* 691N – REAL IMAGE regression on a GENERATED picture in a LOCAL Testy note.
 * Native tests use guarded Java WebView MotionEvent (not a physical finger).
 * Crop/settings/save use actual shipped production UI and model. All failures
 * are explicit; unrelated image settings run despite native gesture failure. */
(()=>{'use strict';
let busy=false;
const KIND='REAL_EDITOR_IMAGE_691N';
const CASES=[
['ui-img-open','Obrázky – otevřít vlastní LOCAL Testy poznámku','APP'],
['ui-img-insert','Obrázky – vložit vlastní PNG do Core V2','APP'],
['ui-img-single','Obrázky – nativní tap bez textového caretu a klávesnice','NATIVE'],
['ui-img-doubletop','Obrázky – nativní dvojtap nahoře otevře fullscreen','NATIVE'],
['ui-img-pinch','Obrázky – skutečný dvouprstý pinch mění zoom','NATIVE'],
['ui-img-pan','Obrázky – skutečný posun přiblíženého náhledu','NATIVE'],
['ui-img-preview-close','Obrázky – zavření fullscreen náhledu','APP'],
['ui-img-doublebottom','Obrázky – nativní dvojtap dole otevře fullscreen','NATIVE'],
['ui-img-settings','Obrázky – skutečné tlačítko Nastavení','APP'],
['ui-img-size','Obrázky – velikost 50 % a 30 % v modelu i DOM','APP'],
['ui-img-wrap','Obrázky – levé/pravé obtékání a návrat na střed','APP'],
['ui-img-crop','Obrázky – skutečný modal Ořez a změna pixelů','APP'],
['ui-img-crop-history','Obrázky – Undo/Redo ořezu bez ztráty zdroje','APP'],
['ui-img-delete-history','Obrázky – smazání a Undo/Redo v produkčním modelu','APP'],
['ui-img-persist','Obrázky – uložení, znovuotevření a zachování okolí','APP']
];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(yes,reason)=>{if(!yes)throw Error(reason);};
const el=id=>document.getElementById(id);
const core=()=>window.LubaNoteEditorV2;
const blocks=()=>core()?.ziskejModel?.()?.bloky||[];
const picture=()=>blocks().find(b=>b?.typ==='obrazek'&&String(b.alt||'').startsWith('AUTOTEST_691N'));
const figure=()=>{const b=picture();return b?core()?.ziskejEditorElement?.()?.querySelector('.ln-v2-obrazek[data-ln-v2-obrazek="'+CSS.escape(b.id)+'"]'):null;};
const image=()=>figure()?.querySelector(':scope > img');
const preview=()=>document.querySelector('.lubaNoteImagePreview[aria-modal="true"]');
const source=()=>String(picture()?.zdroj||'');
const visible=e=>!!(e&&e.isConnected&&!e.hidden&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&e.getBoundingClientRect().width>0);
const owned=id=>window.loadTask?.().some(n=>n?.id===id&&n.storageScope==='local'&&n.isSecret!==true&&n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]'));
function imageSource(){
 const canvas=document.createElement('canvas');canvas.width=480;canvas.height=360;
 const ctx=canvas.getContext('2d');assert(ctx,'png_canvas_unavailable');
 const gradient=ctx.createLinearGradient(0,0,480,360);gradient.addColorStop(0,'#173a54');gradient.addColorStop(1,'#61c2a5');
 ctx.fillStyle=gradient;ctx.fillRect(0,0,480,360);ctx.fillStyle='#ffffff';ctx.font='bold 42px sans-serif';ctx.fillText('691N',70,140);
 return canvas.toDataURL('image/png');
}
async function showImage(){
 window.LubaNoteKeyboard?.skryj?.();
 const img=image();assert(img&&visible(img),'image_dom_not_visible');
 img.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});await wait(180);
 assert(visible(img),'image_hidden_after_scroll');return img;
}
async function native(id,target,type){
 const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
 assert(window.Capacitor?.getPlatform?.()==='android'&&typeof plugin?.gestureOwnedImage==='function','native_image_gesture_not_available');
 const ack=await plugin.gestureOwnedImage({id,target,type});
 assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','native_image_ack_missing');
 return ack;
}
async function open(id){
 await window.openTaskEditorById(id);await wait(140);
 assert(el('taskModal')?.dataset?.taskId===id&&!el('taskModal')?.hidden,'wrong_note_opened');
 assert(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'real_v2_not_active');
}
async function save(){
 const button=el('editorBackButton');assert(button&&!button.disabled,'save_button_missing');button.click();
 for(let i=0;i<35&&!el('taskModal')?.hidden;i++)await wait(110);
 assert(el('taskModal')?.hidden,'save_not_closed');
 await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
}
async function settings(){
 const b=picture();assert(b,'image_missing');await showImage();
 const img=image();img.click();await wait(70);
 const button=figure()?.querySelector('[data-v2-image-settings]');assert(button,'settings_button_missing');
 button.click();await wait(140);
 const modal=document.querySelector('.choiceModal:not([hidden])');
 assert(modal&&modal.querySelector('.choiceDialogTitle')?.textContent?.trim()==='Obrázek','production_settings_modal_missing');
 return modal;
}
function sizeAlign(id,size,align){
 assert(core()?.nastavNastaveniObrazku?.(id,{velikost:size,zarovnani:align})===true,'setting_write_failed');
 const b=picture(),f=figure();assert(b&&f&&String(b.velikost)===size&&b.zarovnani===align,'image_model_setting_incorrect');
 assert(f.dataset.velikost===size&&f.dataset.zarovnani===align,'image_dom_setting_incorrect');
 return f;
}
function zoom(){const str=String(preview()?.querySelector('img')?.style?.transform||'');return Number(str.match(/scale\(([^)]+)\)/)?.[1]||1);}
function transform(){return String(preview()?.querySelector('img')?.style?.transform||'');}
async function run(id,alive=()=>true,onProgress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return CASES.map(([key,name,kind])=>({id:key,name,kind:KIND,status:kind==='NATIVE'?'NATIVE_BLOCKED':'APP_BLOCKED',ms:0,detail:'image_tester_busy'}));
 busy=true;const out=[];let setupFailed=false,hasPreview=false,original='',cropped='';
 try{
  assert(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_not_authorized');
  assert(owned(id),'not_own_LOCAL_Testy_note');
  assert(el('taskModal')?.hidden===true,'another_editor_open');
  minimize();
  for(let i=0;i<CASES.length;i++){
   const [key,name,kind]=CASES[i]; const t=performance.now();let status=kind==='NATIVE'?'NATIVE_PASS':'APP_PASS';let detail='';
   if(!alive())throw Error('test_cancelled');
   onProgress('Obrázky 691N · '+(i+1)+'/'+CASES.length+' · '+name);
   try{
    if(setupFailed){status=kind==='NATIVE'?'NATIVE_BLOCKED':'APP_BLOCKED';detail='image_setup_did_not_pass';}
    else if(i===0){await open(id);detail='Real production V2 + own LOCAL Testy note.';}
    else if(i===1){core()?.nastavPoziciOtevreni?.('end');window.getSelection()?.removeAllRanges?.();const before=blocks().length;
      assert(core()?.vlozObrazek?.({dataUrl:imageSource(),alt:'AUTOTEST_691N_'+Date.now(),velikost:'50',zarovnani:'stred'})===true,'core_image_insert_failed');
      assert(blocks().length>=before+1&&picture()&&image(),'insert_model_or_DOM_missing');
      await showImage();original=source();detail='Generated local PNG inserted with real Core V2 API, checked model+DOM.';
    }
    else if(i===2){await showImage();await native(id,'image-top','tap');await wait(240);
      assert(!visible(document.querySelector('.ln-v2-single-caret-handle')),'image_tap_opened_caret_handle');
      assert(!visible(document.querySelector('.ln-v2-luba-caret')),'image_tap_opened_text_caret');
      assert(!visible(document.getElementById('selectionMenu')),'image_tap_opened_text_menu');
      assert(window.LubaNoteKeyboard?.jeOtevrena?.()!==true,'image_tap_opened_keyboard');
      detail='Native image tap delivered; no caret/drop/selection menu/keyboard.';
    }
    else if(i===3){await showImage();await native(id,'image-top','doubletap');await wait(260);
      assert(visible(preview()),'native_top_doubletap_did_not_open_fullscreen');hasPreview=true;
      detail='Two native taps in upper part opened the production fullscreen overlay.';
    }
    else if(i===4){if(!visible(preview())){status='NATIVE_BLOCKED';detail='fullscreen_not_open';}
      else{await native(id,'preview','pinch');await wait(200);assert(zoom()>1.2,'native_pinch_did_not_increase_zoom_'+zoom());
      detail='True two-pointer MotionEvent increased preview scale to '+zoom().toFixed(2);}}
    else if(i===5){if(!visible(preview())||zoom()<=1.01){status='NATIVE_BLOCKED';detail='zoomed_preview_not_available';}
      else{const before=transform();await native(id,'preview','pan');await wait(140);
      assert(transform()!==before,'native_pan_did_not_move_zoomed_picture');detail='Native pointer drag moved zoomed preview.';}}
    else if(i===6){if(!visible(preview())){status='APP_BLOCKED';detail='fullscreen_did_not_open';}
      else{const close=preview().querySelector('.lubaNoteImagePreviewClose');assert(close,'preview_close_missing');close.click();await wait(95);
      assert(!preview(),'preview_close_did_not_work');detail='Real close button dismissed fullscreen.';}}
    else if(i===7){await showImage();await native(id,'image-bottom','doubletap');await wait(240);
      assert(visible(preview()),'native_bottom_doubletap_did_not_open_fullscreen');
      preview().querySelector('.lubaNoteImagePreviewClose')?.click();await wait(100);assert(!preview(),'preview_close_bottom_failed');
      detail='Native doubletap in lower part also opens fullscreen; closed afterward.';}
    else if(i===8){if(preview())window.LubaNoteEditorMediaV2?.zavriNahledObrazku?.();const modal=await settings();assert(modal.querySelector('.choiceDialogSave'),'settings_save_missing');
      window.zavriVyberovyModal?.();await wait(120);assert(!document.querySelector('.choiceModal:not([hidden])'),'settings_cancel_failed');
      detail='Real image settings opened via rendered gear and closed without changes.';}
    else if(i===9){const idpic=picture()?.id;assert(idpic,'image_missing_before_resize');
      sizeAlign(idpic,'50','vlevo');await wait(120);sizeAlign(idpic,'30','vpravo');await wait(120);
      detail='Real Core V2 size 50 and 30; model + figure datasets match.';}
    else if(i===10){const idpic=picture()?.id;const l=sizeAlign(idpic,'50','vlevo');await wait(170);
      assert(getComputedStyle(l).float==='left','left_text_wrap_float_missing');
      const r=sizeAlign(idpic,'50','vpravo');await wait(160);
      assert(getComputedStyle(r).float==='right','right_text_wrap_float_missing');
      const c=sizeAlign(idpic,'50','stred');await wait(90);
      assert(getComputedStyle(c).float==='none','center_did_not_clear_float');
      detail='Image CSS float left/right/none checked in live document; does NOT prove every paragraph geometry.';}
    else if(i===11){const modal=await settings();await wait(150);
      const crop=modal.querySelector('[data-v2-crop-open]');assert(crop,'settings_crop_option_missing');crop.click();
      for(let k=0;k<25&&!document.querySelector('.lnV2CropModal:not([hidden])')?._lnV2Crop;k++)await wait(110);
      assert(document.querySelector('.lnV2CropModal:not([hidden])')?._lnV2Crop,'crop_image_not_loaded');
      const btn=document.querySelector('[data-v2-crop-save]');assert(visible(btn),'crop_modal_not_ready');
      const prev=source();btn.click();await wait(160);
      cropped=source();assert(cropped.startsWith('data:image/')&&cropped!==prev,'crop_pixels_not_changed');
      detail='Real settings > Crop modal > Save; new image source differs from original.';}
    else if(i===12){assert(cropped&&original,'crop_history_missing_initial_state');
      assert(core()?.undo?.()===true,'crop_undo_failed');assert(source()!==cropped,'crop_undo_did_not_restore_source');
      assert(core()?.redo?.()===true,'crop_redo_failed');assert(source()===cropped,'crop_redo_source_mismatch');
      detail='Core V2 Undo restored previous pixels; Redo restored cropped source.';}
    else if(i===13){const idpic=picture()?.id;assert(idpic,'image_missing_before_delete');
      assert(core()?.smazObrazek?.(idpic)===true,'image_delete_failed');assert(!picture(),'image_delete_not_in_model');
      assert(core()?.undo?.()===true,'image_delete_undo_failed');assert(picture()?.id===idpic,'image_undo_not_restored');
      assert(core()?.redo?.()===true,'image_delete_redo_failed');assert(!picture(),'image_redo_not_removed');
      assert(core()?.undo?.()===true,'image_delete_last_undo_failed');assert(picture()?.id===idpic,'image_restoration_failed');
      detail='Delete/Undo/Redo/Undo on generated image; image stays for review.';}
    else if(i===14){const b=picture();assert(b&&image(),'image_missing_before_save');
      const snapshot={id:b.id,src:b.zdroj,size:b.velikost,align:b.zarovnani};
      const textBefore=blocks().filter(x=>x.typ!=='obrazek').length;
      await save();await open(id);const after=picture();
      assert(after&&image()&&after.id===snapshot.id&&after.zdroj===snapshot.src&&
        after.velikost===snapshot.size&&after.zarovnani===snapshot.align,'image_lost_or_changed_after_reopen');
      assert(blocks().filter(x=>x.typ!=='obrazek').length>=textBefore,'neighbor_text_lost_after_image_save');
      await save();detail='Image bytes/size/position and neighboring text persisted after production save/reopen.';}
   }catch(e){status=kind==='NATIVE'?'NATIVE_FAIL':'APP_FAIL';detail=String(e?.message||e).slice(0,175);
     if(i<2)setupFailed=true;
     if(i===2&&detail==='native_image_gesture_not_available'){status='NATIVE_BLOCKED';}
     if((i===3||i===4||i===5||i===7)&&detail==='native_image_gesture_not_available')status='NATIVE_BLOCKED';
   }
   out.push({id:key,name,kind:KIND,status,ms:Math.round(performance.now()-t),detail:detail+' Generated LOCAL Testy image; native=WebView dispatch, not physical fingers.'});
   const factor=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);
   await wait(factor>0?Math.round(factor*380):90);
  }
 }catch(e){out.push({id:'ui-img-run',name:'Obrázky – spuštění živé regrese',kind:KIND,status:'APP_BLOCKED',ms:0,detail:String(e?.message||e)});}
 finally{try{window.LubaNoteEditorMediaV2?.zavriNahledObrazku?.();}catch(_e){}restore();busy=false;}
 const used=new Set(out.map(x=>x.id));for(const [key,name,kind] of CASES)if(!used.has(key))out.push({id:key,name,kind:KIND,status:kind==='NATIVE'?'NATIVE_BLOCKED':'APP_BLOCKED',ms:0,detail:'Image test was not executed.'});
 return out;
}
window.LubaNoteAutoTesterLive691N=Object.freeze({run,expected:CASES.map(x=>x[0])});
})();
