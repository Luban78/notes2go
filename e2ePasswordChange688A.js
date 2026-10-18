/* LubaNote 688C – změna HLAVNÍHO E2E hesla na odemčeném zařízení.
 * Heslo nikdy neukládej ani neloguj. Běžné legacy plaintext poznámky
 * nezměníme, Root Key zůstává stejný. DB commit je jediná transakce.
 */
(() => {
  'use strict';
  const texty = {
    cs: ['Změna hlavního E2E hesla', 'Nové E2E heslo (alespoň 12 znaků)', 'Zopakuj nové E2E heslo',
      'Změnit E2E heslo', 'Zrušit', 'Zařízení musí být odemčené a synchronizované. Pokud používáš Secret, nejprve ho odemkni. Ostatní zařízení budou vyžadovat nové E2E heslo; biometrie Secret se vypne.',
      'Hesla se neshodují.', 'Heslo musí mít alespoň 12 znaků.', 'Připravuji bezpečnou změnu…',
      'Heslo změněno na serveru i v zařízení. Klepni na Hotovo – LubaNote se sama obnoví. Secret případně odemkni novým heslem.',
      'Změna na serveru proběhla, ale místní dokončení selhalo. Neodinstalovávej aplikaci ani nemaž data. Po restartu použij NOVÉ E2E heslo.',
      'Nejdřív dokonči synchronizaci všech poznámek.', 'Původní heslo a nové heslo jsou stejné.', 'Přihlašovací heslo k účtu (jednorázové ověření)', 'Zadej přihlašovací heslo k účtu. Nemění se.', 'Hotovo'],
    en: ['Change main E2E password','New E2E password (at least 12 characters)','Repeat new E2E password',
      'Change E2E password','Cancel','Device must be unlocked and synced. Unlock Secret first if you use it. Other devices will require the new E2E password; Secret biometrics will be disabled.',
      'Passwords do not match.','Use at least 12 characters.','Preparing secure change…',
      'Password changed on server and device. Tap Done to reload LubaNote automatically. Unlock Secret with the new password if needed.',
      'Server change succeeded but local finishing failed. Do not clear app data. Restart and use the NEW E2E password.',
      'Finish synchronizing all notes first.','The new password is the same as the old password.', 'Account sign-in password (one-time verification)', 'Enter your account sign-in password. It will not be changed.', 'Done'],
    sk: ['Zmena hlavného E2E hesla','Nové E2E heslo (aspoň 12 znakov)','Zopakuj nové E2E heslo',
      'Zmeniť E2E heslo','Zrušiť','Zariadenie musí byť odomknuté a synchronizované. Ak používaš Secret, najprv ho odomkni. Ostatné zariadenia budú potrebovať nové E2E heslo; biometria Secret sa vypne.',
      'Heslá sa nezhodujú.','Heslo musí mať aspoň 12 znakov.','Pripravujem bezpečnú zmenu…',
      'Heslo bolo zmenené na serveri aj v zariadení. Ťukni na Hotovo – LubaNote sa obnoví. Secret prípadne odomkni novým heslom.',
      'Zmena na serveri prebehla, ale miestne dokončenie zlyhalo. Neodinštaluj aplikáciu ani nemaž údaje. Po reštarte použi NOVÉ E2E heslo.',
      'Najprv dokonči synchronizáciu poznámok.','Nové heslo je rovnaké ako pôvodné.','Prihlasovacie heslo účtu (jednorazové overenie)','Zadaj prihlasovacie heslo účtu. Nemení sa.','Hotovo'],
    de: ['E2E-Hauptpasswort ändern','Neues E2E-Passwort (mind. 12 Zeichen)','Neues E2E-Passwort wiederholen',
      'E2E-Passwort ändern','Abbrechen','Das Gerät muss entsperrt und synchronisiert sein. Entsperre Secret zuerst, falls du es nutzt. Andere Geräte benötigen das neue E2E-Passwort; die Secret-Biometrie wird deaktiviert.',
      'Passwörter stimmen nicht überein.','Mindestens 12 Zeichen eingeben.','Sichere Änderung wird vorbereitet…',
      'Passwort auf dem Server und Gerät geändert. Tippe auf Fertig, um LubaNote neu zu laden. Entsperre Secret bei Bedarf mit dem neuen Passwort.',
      'Serveränderung erfolgreich, aber lokaler Abschluss fehlgeschlagen. App nicht deinstallieren und keine Daten löschen. Nach dem Neustart das NEUE E2E-Passwort verwenden.',
      'Zuerst die Notizen vollständig synchronisieren.','Das neue Passwort entspricht dem alten.','Konto-Anmeldepasswort (einmalige Prüfung)','Gib das Konto-Anmeldepasswort ein. Es wird nicht geändert.','Fertig'],
    pl: ['Zmiana głównego hasła E2E','Nowe hasło E2E (co najmniej 12 znaków)','Powtórz nowe hasło E2E',
      'Zmień hasło E2E','Anuluj','Urządzenie musi być odblokowane i zsynchronizowane. Jeśli używasz Secret, odblokuj go najpierw. Inne urządzenia będą wymagały nowego hasła E2E; biometria Secret zostanie wyłączona.',
      'Hasła są różne.','Hasło musi mieć co najmniej 12 znaków.','Przygotowuję bezpieczną zmianę…',
      'Hasło zmieniono na serwerze i urządzeniu. Wybierz Gotowe, aby przeładować LubaNote. W razie potrzeby odblokuj Secret nowym hasłem.',
      'Zmiana na serwerze się powiodła, ale lokalne zakończenie nie. Nie odinstalowuj aplikacji ani nie usuwaj danych. Po restarcie użyj NOWEGO hasła E2E.',
      'Najpierw zakończ synchronizację notatek.','Nowe hasło jest takie samo jak stare.','Hasło logowania do konta (jednorazowa weryfikacja)','Podaj hasło logowania do konta. Nie zostanie zmienione.','Gotowe'],
    es: ['Cambiar contraseña E2E principal','Nueva contraseña E2E (mínimo 12 caracteres)','Repite la nueva contraseña E2E',
      'Cambiar contraseña E2E','Cancelar','El dispositivo debe estar desbloqueado y sincronizado. Desbloquea Secret primero si lo usas. Los demás dispositivos requerirán la nueva contraseña E2E; la biometría de Secret se desactivará.',
      'Las contraseñas no coinciden.','Introduce al menos 12 caracteres.','Preparando el cambio seguro…',
      'Contraseña cambiada en el servidor y el dispositivo. Pulsa Listo para recargar LubaNote. Desbloquea Secret con la nueva contraseña si es necesario.',
      'El cambio se realizó en el servidor, pero falló al terminar en este dispositivo. No desinstales la aplicación ni borres los datos. Tras reiniciar usa la NUEVA contraseña E2E.',
      'Termina primero la sincronización de las notas.','La contraseña nueva es igual a la anterior.','Contraseña de acceso a la cuenta (verificación única)','Introduce la contraseña de acceso. No se cambiará.','Listo']
  };
  const jazyk = () => {
    const k = String(window.LubaNoteI18n?.ziskejJazyk?.() || window.LubaNoteI18n?.ziskejLocale?.() || document.documentElement.lang || 'cs').slice(0,2).toLowerCase();
    return texty[k] || texty.cs;
  };
  const b64 = bajty => {
    let s = ''; for (let i=0;i<bajty.length;i+=8192) s += String.fromCharCode(...bajty.subarray(i,i+8192));
    return btoa(s);
  };
  const stejne = (a,b) => a.length===b.length && a.every((x,i)=>x===b[i]);
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8',{fatal:true});
  const kopie = o => JSON.parse(JSON.stringify(o));
  function kontroluj(stav, duvod) { if (!stav) throw new Error(duvod); }
  // 688L: AES-GCM pouziva nahodne IV; rozdilna obalka muze chranit totozny obsah.
  // Porovnavame CELOU JSON strukturu vcetne metadat (nikdy jen viditelny text).
  function kanonickyJSON688L(hodnota) {
    if (Array.isArray(hodnota)) return '['+hodnota.map(kanonickyJSON688L).join(',')+']';
    if (hodnota && typeof hodnota==='object') return '{'+Object.keys(hodnota).sort()
      .map(k=>JSON.stringify(k)+':'+kanonickyJSON688L(hodnota[k])).join(',')+'}';
    return JSON.stringify(hodnota);
  }
  function shodaSecretSPripustnymCasem688P(a,b) {
    if (kanonickyJSON688L(a)===kanonickyJSON688L(b)) return true;
    const maCas=x=>Object.prototype.hasOwnProperty.call(x,'updatedAt') &&
      typeof x.updatedAt==='string' && x.updatedAt.trim()!=='' &&
      Number.isFinite(Date.parse(x.updatedAt));
    if (!maCas(a) || !maCas(b)) return false;
    // Vylucime VYHRADNE nejvyssi updatedAt, ne stejnojmenna vnorenna pole.
    const aData={...a},bData={...b};
    delete aData.updatedAt;delete bData.updatedAt;
    return kanonickyJSON688L(aData)===kanonickyJSON688L(bData);
  }
  async function overShoduSecretObsahu688L(lokalni,serverovy) {
    kontroluj(lokalni?.id && serverovy?.id && String(lokalni.id)===String(serverovy.id),
      'unsynced_local_secret_record');
    const a=lokalni.encrypted,b=serverovy.data?.encrypted;
    kontroluj(a && b && Number(a.version)===1 && Number(b.version)===1 &&
      a.algorithm==='AES-GCM' && b.algorithm==='AES-GCM' &&
      typeof a.iv==='string' && typeof a.ciphertext==='string' &&
      typeof b.iv==='string' && typeof b.ciphertext==='string',
      'local_secret_envelope_invalid');
    kontroluj(typeof desifrujTajnouPoznamku==='function','secret_decrypt_unavailable');
    let pa,pb;
    try {pa=await desifrujTajnouPoznamku(a,lokalni.id);}
    catch(_error){throw new Error('local_secret_decrypt_failed');}
    try {pb=await desifrujTajnouPoznamku(b,serverovy.id);}
    catch(_error){throw new Error('server_secret_decrypt_failed');}
    kontroluj(pa && pb && typeof pa==='object' && !Array.isArray(pa) &&
      typeof pb==='object' && !Array.isArray(pb) &&
      String(pa.id)===String(lokalni.id) && String(pb.id)===String(serverovy.id),
      'secret_note_id_mismatch');
    // 688P: pripustny je POUZE rozdil v top-level casovem udaji updatedAt.
    // Oba dokumenty museji mit platne casove razitko; veskery ostatni
    // desifrovany obsah a metadata musi byt bitove/strukturne shodne.
    // Pri prebaleni zachovavame serverovou kanonickou verzi dokumentu.
    kontroluj(shodaSecretSPripustnymCasem688P(pa,pb),
      'local_secret_plaintext_mismatch');
    return ['version','algorithm','iv','ciphertext'].every(k=>a[k]===b[k]);
  }
  function klient() {
    try { if(typeof supabaseClient!=='undefined') return supabaseClient; } catch(_e){}
    return window.supabaseClient;
  }
  async function nactiVse(tabulka,pole,uid,maximum=5000) {
    const cl=klient();
    const {count,error:chyba}=await cl.from(tabulka).select('id',{head:true,count:'exact'}).eq('user_id',uid);
    kontroluj(!chyba && Number.isSafeInteger(count) && count<=maximum && count>=0,`${tabulka}_count_failed`);
    const radky=[];
    for(let od=0;od<count;od+=200) {
      const {data,error}=await cl.from(tabulka).select(pole).eq('user_id',uid)
        .order('id',{ascending:true}).range(od,Math.min(od+199,count-1));
      kontroluj(!error && Array.isArray(data) && data.length===Math.min(200,count-od), `${tabulka}_page_failed`);
      radky.push(...data);
    }
    kontroluj(radky.length===count && new Set(radky.map(r=>String(r.id))).size===count,`${tabulka}_snapshot_invalid`);
    return radky;
  }
  async function prebalBox(bajty,klic,aad) {
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const obsah=new Uint8Array(await crypto.subtle.encrypt(
      {name:'AES-GCM',iv,additionalData:enc.encode(aad)},klic,bajty));
    let test=null;
    try {
      test=new Uint8Array(await crypto.subtle.decrypt(
        {name:'AES-GCM',iv,additionalData:enc.encode(aad)},klic,obsah));
      kontroluj(stejne(bajty,test),'new_envelope_roundtrip_failed');
      return {version:1,algorithm:'AES-GCM',iv:b64(iv),ciphertext:b64(obsah)};
    } finally { test?.fill(0); obsah.fill(0); }
  }
  async function odvodKlic(material,prefix,salt) {
    const hl=enc.encode(prefix),s=new Uint8Array(hl.length+salt.length);
    s.set(hl);s.set(salt,hl.length);
    try {return await crypto.subtle.deriveKey({name:'PBKDF2',salt:s,iterations:600000,hash:'SHA-256'},
      material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
    finally{s.fill(0);}
  }
  async function pripravZmenu(noveHeslo,hlas) {
    const cl=klient(),media=window.LubaNoteMediaCrypto,core=window.LubaNoteE2ECore;
    kontroluj(navigator.onLine && cl?.auth?.getUser && cl?.rpc && cl?.from,'online_backend_required');
    kontroluj(window.LubaNoteStorageScope?.ziskejAktivni?.()!=='local','cloud_space_required');
    kontroluj(window.LubaNoteSyncStatus?.ziskejStav?.()==='synced','sync_not_finished');
    kontroluj(media?.jeKlicDostupny?.()===true && core?.jePripraven?.()===true,'unlocked_keys_required');
    const {data:auth,error:chybaAuth}=await cl.auth.getUser();
    const uid=auth?.user?.id;
    kontroluj(!chybaAuth && uid && uid===localStorage.getItem('lubanoteLocalOwnerUserId'),'owner_mismatch');
    kontroluj(core.getStav()?.userId===uid && core.getStav()?.ready===true,'root_not_ready');
    const {data:settings,error:chybaSettings}=await cl.from('secret_settings')
      .select('user_id,salt,verifier,kdf_iterations,e2e_root_key_id,e2e_root_key_box,e2e_root_key_version,e2e_root_key_algorithm')
      .eq('user_id',uid).maybeSingle();
    kontroluj(!chybaSettings && settings?.user_id===uid && Number(settings.kdf_iterations)===600000 &&
      settings.e2e_root_key_version===1 && settings.e2e_root_key_algorithm==='HKDF-SHA-256' &&
      settings.e2e_root_key_id===core.getStav().keyId,'settings_or_root_mismatch');
    kontroluj(typeof vytvorVerifierZHesla==='function','secret_verifier_unavailable');
    kontroluj((await vytvorVerifierZHesla(noveHeslo,settings.salt,600000))!==settings.verifier,'same_password');
    let rootRaw=null,material=null,sharedRaw=null,novySecretKlic=null,novyMediaKlic=null;
    let noveNastaveni=null,noteZmeny=[],tagZmeny=[],lokalniStitky=null;
    let noteRadky=[],tagRadky=[];
    try {
      rootRaw=await media.rozbalBajtyE2ECore(settings.e2e_root_key_box,`LubaNote-e2e-account-root-v1:${uid}`);
      kontroluj(rootRaw instanceof Uint8Array && rootRaw.length===32,'root_unwrap_failed');
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',rootRaw));
      const id=`rk1_${b64(digest.slice(0,18)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}`;
      digest.fill(0);
      kontroluj(id===settings.e2e_root_key_id,'root_identity_invalid');
      const salt=crypto.getRandomValues(new Uint8Array(16));
      const salt64=b64(salt);
      const hesloBajty=enc.encode(noveHeslo);
      material=await crypto.subtle.importKey('raw',hesloBajty,'PBKDF2',false,['deriveKey','deriveBits']);
      hesloBajty.fill(0);
      novyMediaKlic=await odvodKlic(material,'LubaNote-media-encryption-v1',salt);
      novySecretKlic=await odvodKlic(material,'LubaNote-encryption-v1',salt);
      const verifier=await vytvorVerifierZHesla(noveHeslo,salt64,600000);
      kontroluj(typeof verifier==='string' && verifier.length===44,'new_verifier_invalid');
      const novyRoot=await prebalBox(rootRaw,novyMediaKlic,
        `LubaNote-e2e-core-wrap-v1:LubaNote-e2e-account-root-v1:${uid}`);
      noveNastaveni={salt:salt64,verifier,kdf_iterations:600000,
        e2e_root_key_id:settings.e2e_root_key_id,e2e_root_key_box:novyRoot};
      salt.fill(0);
      const {data:shared,error:chybaShared}=await cl.from('lubanote_shared_crypto_identities')
        .select('user_id,algorithm,key_version,public_key_jwk,private_key_box')
        .eq('user_id',uid).maybeSingle();
      kontroluj(!chybaShared,'shared_identity_read_failed');
      let puvodniShared=null,novyShared=null;
      if(shared){
        kontroluj(shared.user_id===uid && shared.algorithm==='ECDH-P256' && Number(shared.key_version)===1 &&
          shared.private_key_box?.algorithm==='AES-GCM','shared_identity_invalid');
        puvodniShared=shared.private_key_box;
        sharedRaw=await media.rozbalBajtyHlavnimKlicem(puvodniShared,`shared-identity:${uid}:v1`);
        kontroluj(sharedRaw instanceof Uint8Array && sharedRaw.length>50,'shared_unwrap_failed');
        novyShared=await prebalBox(sharedRaw,novyMediaKlic,`LubaNote-shared-wrap-v1:shared-identity:${uid}:v1`);
        // The preserved ECDH private identity must continue matching the old public identity.
        const soukromy=await crypto.subtle.importKey('pkcs8',sharedRaw,{name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
        const verejny=await crypto.subtle.importKey('jwk',shared.public_key_jwk,{name:'ECDH',namedCurve:'P-256'},false,[]);
        const test=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
        const a=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:test.publicKey},soukromy,256));
        const b=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:verejny},test.privateKey,256));
        kontroluj(stejne(a,b),'shared_identity_mismatch');a.fill(0);b.fill(0);
      }
      hlas?.('Kontroluji poznámky a tajné štítky…');
      noteRadky=await nactiVse('notes','id,data,deleted_at',uid,5000);
      tagRadky=await nactiVse('tags','id,encrypted_name,is_secret,deleted_at',uid,1000);
      // Secret is stored in notes.data, not in a notes.is_secret column.
      const tajne=noteRadky.filter(r=>r.data?.__lubanoteSecret===true);
      // 688Q: Tombstones bez ciphertextu neobsahuji E2E nazev, ktery lze prebalit.
      // Aktivni Secret stitky VZDY overit; smazane s ciphertextem take prebalit.
      // Zaznamy v DB zachovat beze zmeny; SQL RPC musi pouzit STEJNY rozsah.
      const musiPrebalitTajnyStitek688Q=r=>r.is_secret===true &&
        (!r.deleted_at || Boolean(r.encrypted_name?.ciphertext));
      const soukromeStitky=tagRadky.filter(musiPrebalitTajnyStitek688Q);
      let localTags=[];
      if(typeof nactiSyroveLokalniStitky==='function')localTags=nactiSyroveLokalniStitky();
      const lokalniTajneStitky=localTags.filter(r=>r.is_secret===true);
      if(tajne.length || soukromeStitky.length || lokalniTajneStitky.length){
        kontroluj(typeof tajnySifrovaciKlic!=='undefined' && tajnySifrovaciKlic instanceof CryptoKey &&
          typeof tajnyRezimOdemceny!=='undefined' && tajnyRezimOdemceny===true,
          'unlock_secret_first');
      }
      // Do not discard device-only Secret records that have not reached the server.
      const lokalniTajne=typeof nactiSifrovaneTajneZaznamy==='function' ? nactiSifrovaneTajneZaznamy():[];
      const tajnaMapa=new Map(tajne.map(r=>[String(r.id),r]));
      for(const rec of lokalniTajne){
        const cloud=tajnaMapa.get(String(rec.id));
        kontroluj(!!cloud,'unsynced_local_secret_record');
        // 688L: obe obalky musi uspesne desifrovat na totozny cely obsah.
        // Pokud je obsah jiny / klic neplati, zmena hesla se pred RPC zastavi.
        await overShoduSecretObsahu688L(rec,cloud);
      }
      const localStages=[];
      for(const lt of lokalniTajneStitky){
        kontroluj(lt?.encrypted_name?.ciphertext && typeof desifrujNazevTajnehoStitku==='function','local_secret_tag_invalid');
        const plain=await desifrujNazevTajnehoStitku(lt.encrypted_name,lt.id);
        const next=await prebalBox(enc.encode(plain),novySecretKlic,`LubaNote-secret-tag-v1:${lt.id}`);
        localStages.push({...lt,encrypted_name:next});
      }
      if(localStages.length)lokalniStitky=localTags.map(r=>localStages.find(t=>t.id===r.id)||r);
      for(const r of tagRadky){
        if(!musiPrebalitTajnyStitek688Q(r))continue;
        kontroluj(r.encrypted_name?.ciphertext && typeof desifrujNazevTajnehoStitku==='function','secret_tag_invalid');
        const plain=await desifrujNazevTajnehoStitku(r.encrypted_name,r.id);
        const next=await prebalBox(enc.encode(plain),novySecretKlic,`LubaNote-secret-tag-v1:${r.id}`);
        tagZmeny.push({id:r.id,old_encrypted_name:r.encrypted_name,new_encrypted_name:next});
      }
      for(const r of noteRadky){
        const old=r.data;
        kontroluj(old && typeof old==='object' && !Array.isArray(old),'invalid_note_data');
        const e2e=old.__lubanoteE2ENote===true;
        const secret=old.__lubanoteSecret===true;
        // Never allow malformed envelopes or legacy plaintext Secret to slip by.
        kontroluj(!(Object.prototype.hasOwnProperty.call(old,'__lubanoteSecret') &&
          (!secret || old.encrypted?.algorithm!=='AES-GCM' ||
           !old.encrypted?.iv || !old.encrypted?.ciphertext)),
          'secret_envelope_invalid');
        kontroluj(!(old.isSecret===true && !secret),'legacy_plaintext_secret_unsupported');
        kontroluj(!(Object.prototype.hasOwnProperty.call(old,'__lubanoteE2ENote') &&
          old.__lubanoteE2ENote!==true),'e2e_envelope_invalid');
        kontroluj(!(e2e&&secret),'unsupported_mixed_note');
        let note=old;
        if(e2e){
          kontroluj(typeof window.LubaNoteNotesCrypto?.desifruj==='function','e2e_notes_unavailable');
          note=await window.LubaNoteNotesCrypto.desifruj(old,uid,r.id);
        } else if(secret){
          kontroluj(old?.encrypted && typeof desifrujTajnouPoznamku==='function','secret_note_invalid');
          note=await desifrujTajnouPoznamku(old.encrypted,r.id);
        }
        let changed=false;
        const copy=kopie(note);
        if(copy?.__lubanoteMediaVault){
          const vault=copy.__lubanoteMediaVault;
          kontroluj(Number(vault.version)===1 && vault.algorithm==='AES-GCM' &&
            vault.items && typeof vault.items==='object' && !Array.isArray(vault.items),'media_vault_invalid');
          for(const [mediaId,record] of Object.entries(vault.items)){
            const result=await media.recoveryStageMediaRecord686O(record,r.id,mediaId,novyMediaKlic);
            kontroluj(result?.ok===true && result.record,'media_rewrap_failed');
            vault.items[mediaId]=result.record;
          }
          changed=true;
        }
        let replacement;
        if(secret){
          const raw=enc.encode(JSON.stringify(copy));
          replacement={...old,encrypted:await prebalBox(raw,novySecretKlic,`LubaNote-secret-note-v1:${r.id}`)};
          raw.fill(0);
          changed=true;
        } else if(e2e){
          replacement=await window.LubaNoteNotesCrypto.zasifruj(copy,uid);
          const over=await window.LubaNoteNotesCrypto.desifruj(replacement,uid,r.id);
          kontroluj(JSON.stringify(over)===JSON.stringify(copy),'e2e_new_note_invalid');
          changed=true;
        } else if(changed){replacement=copy;}
        if(changed){
          kontroluj(JSON.stringify(replacement)!==JSON.stringify(old),'note_staging_failed');
          noteZmeny.push({id:r.id,old_data:old,new_data:replacement});
        }
      }
      const cetka=noteRadky.filter(r=>
        Object.prototype.hasOwnProperty.call(r.data,'__lubanoteSecret') ||
        Object.prototype.hasOwnProperty.call(r.data,'__lubanoteE2ENote') ||
        Object.prototype.hasOwnProperty.call(r.data,'__lubanoteMediaVault') ||
        r.data.isSecret===true).length;
      kontroluj(noteZmeny.length===cetka && tagZmeny.length===soukromeStitky.length,
        'protected_data_coverage_failed');
      kontroluj(enc.encode(JSON.stringify(noteZmeny)).length<14000000,'notes_payload_too_large');
      const stary={salt:settings.salt,verifier:settings.verifier,kdf_iterations:600000,
        e2e_root_key_id:settings.e2e_root_key_id,e2e_root_key_box:settings.e2e_root_key_box};
      // Return only ephemeral encrypted materials. Never persist or log new password.
      return {uid,stary,novy:noveNastaveni,puvodniShared,novyShared,noteZmeny,tagZmeny,
        lokalniStitky,lokalniTajne,noteCount:noteRadky.length,tagCount:tagRadky.length,
        novySecretKlic,secretOdemceny:(typeof tajnyRezimOdemceny!=='undefined' && tajnyRezimOdemceny===true)};
    } finally {rootRaw?.fill(0);sharedRaw?.fill(0);material=null;novyMediaKlic=null;}
  }
  // Separate one-time Auth login proves the account password to GoTrue.
  // The server independently verifies auth.sessions.created_at and the JWT's
  // session_id; a refreshed old JWT cannot pass by changing its iat.
  async function overJednorazovePrihlaseni(heslo, userId) {
    kontroluj(typeof heslo==='string' && heslo.length>0,'account_password_required');
    const cl=klient();
    kontroluj(cl?.supabaseUrl && cl?.supabaseKey &&
      typeof window.supabase?.createClient==='function','reauth_client_unavailable');
    const {data:current,error:currentError}=await cl.auth.getUser();
    kontroluj(!currentError && current?.user?.id===userId &&
      typeof current.user.email==='string' && current.user.email,'active_account_changed');
    const temporary=window.supabase.createClient(cl.supabaseUrl,cl.supabaseKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
        storageKey:'ln688b-once-no-persistence'}
    });
    try {
      const {data:login,error:loginError}=await temporary.auth.signInWithPassword({
        email:current.user.email,password:heslo
      });
      kontroluj(!loginError && login?.user?.id===userId &&
        typeof login?.session?.access_token==='string','account_reauthentication_failed');
      const {data:check,error:checkError}=await temporary.auth.getUser();
      kontroluj(!checkError && check?.user?.id===userId,'reauth_identity_changed');
      const {data:after,error:afterError}=await cl.auth.getUser();
      kontroluj(!afterError && after?.user?.id===userId,'active_account_changed');
      return temporary;
    } catch(error) {
      try {await temporary.auth.signOut({scope:'local'});} catch(_e){}
      throw error;
    }
  }
  // 688R: pouze bezpecny chybovy kod z neuspesne RPC, nikdy hesla/ID/payload.
  // Nezasahuje do RPC, jeho parametru, transakce ani rewrap kontrol.
  function bezpecnyKodRpc688R(error,data,expectedNotes,expectedTags){
    for(const x of [error?.message,error?.details,error?.hint]){
      const found=String(x||'').match(/\b688[A-Z]_[A-Z0-9_]+\b/);
      if(found)return 'rpc_rejected_'+found[0];
    }
    if(error){
      const code=String(error.code||'');
      return 'rpc_rejected_'+(/^[A-Z0-9]{4,12}$/.test(code)?code:'unknown');
    }
    if(!data || typeof data!=='object')return 'rpc_response_missing';
    if(data.ok!==true)return 'rpc_response_not_ok';
    if(data.atomic!==true)return 'rpc_response_not_atomic';
    if(data.root_key_id_preserved!==true)return 'rpc_root_id_unconfirmed';
    if(Number(data.notes_rewrapped)!==expectedNotes)return 'rpc_note_count_mismatch';
    if(Number(data.tags_rewrapped)!==expectedTags)return 'rpc_tag_count_mismatch';
    return 'rpc_reply_not_confirmed';
  }
  let probiha=false;
  async function zmen(noveHeslo,prihlasovaciHeslo,hlas){
    if(probiha) return {ok:false,reason:'already_running'};
    probiha=true;
    window.LubaNoteE2EDeviceGuard688T?.zacinaMistniZmenu?.();
    let stage=null,potvrzeno=false,docasnyKlient=null;
    try {
      stage=await pripravZmenu(noveHeslo,hlas);
      const media=window.LubaNoteMediaCrypto,cl=klient();
      // Normalize stale local media-vault copies while the OLD media key is still available.
      if(media.recoveryPreRewrapLocalMedia688A){
        const r=await media.recoveryPreRewrapLocalMedia688A();
        kontroluj(r?.ok===true,'local_media_cache_not_ready');
      }
      kontroluj(window.LubaNoteSyncStatus?.ziskejStav?.()==='synced','sync_changed_during_staging');
      hlas?.('Ověřuji přihlašovací heslo k účtu…');
      docasnyKlient=await overJednorazovePrihlaseni(prihlasovaciHeslo,stage.uid);
      kontroluj(window.LubaNoteSyncStatus?.ziskejStav?.()==='synced','sync_changed_after_reauth');
      hlas?.('Ukládám změnu hesla jako jednu transakci…');
      const {data,error}=await docasnyKlient.rpc('lubanote_change_e2e_password_688b',{
        p_expected_settings:stage.stary,p_new_settings:stage.novy,
        p_expected_shared_box:stage.puvodniShared,p_new_shared_box:stage.novyShared,
        p_note_changes:stage.noteZmeny,p_tag_changes:stage.tagZmeny,
        p_expected_notes:stage.noteCount,p_expected_tags:stage.tagCount
      });
      const odpovedPotvrzena=!error && data?.ok===true && data?.atomic===true &&
        data?.root_key_id_preserved===true &&
        Number(data.notes_rewrapped)===stage.noteZmeny.length &&
        Number(data.tags_rewrapped)===stage.tagZmeny.length;
      if(!odpovedPotvrzena){
        // RPC reply can be lost after a successful transaction. Reconcile using
        // a strict comparison against the precomputed NEW settings before retry.
        const {data:current,error:readError}=await cl.from('secret_settings')
          .select('salt,verifier,kdf_iterations,e2e_root_key_id,e2e_root_key_box')
          .eq('user_id',stage.uid).maybeSingle();
        const same=!readError && current?.salt===stage.novy.salt &&
          current?.verifier===stage.novy.verifier &&
          Number(current?.kdf_iterations)===600000 &&
          current?.e2e_root_key_id===stage.novy.e2e_root_key_id &&
          ['algorithm','version','iv','ciphertext'].every(k=>
            current?.e2e_root_key_box?.[k]===stage.novy.e2e_root_key_box?.[k]);
        if(!same)throw new Error(readError?'commit_status_unknown':
          bezpecnyKodRpc688R(error,data,stage.noteZmeny.length,stage.tagZmeny.length));
      }
      potvrzeno=true;
      hlas?.('Server změnu potvrdil. Aktualizuji zařízení…');
      const newSecretMap=new Map(stage.noteZmeny.filter(x=>x.new_data?.encrypted)
        .map(x=>[String(x.id),x.new_data.encrypted]));
      const local=stage.lokalniTajne.map(r=>newSecretMap.has(String(r.id))
        ? {...r,encrypted:newSecretMap.get(String(r.id))}:r);
      if(local.length && typeof ulozSifrovaneTajneZaznamy==='function')ulozSifrovaneTajneZaznamy(local);
      if(stage.lokalniStitky){
        kontroluj(typeof ulozSyroveLokalniStitky==='function' &&
          ulozSyroveLokalniStitky(stage.lokalniStitky,stage.uid)===true,'local_tags_update_failed');
      }
      // 688J: The server already committed. Install new local settings and
      // media KEK before replacing the Root envelope. Never store a Root box
      // requiring a new KEK while the browser still has only the old KEK.
      kontroluj(typeof ulozLokalniTajneNastaveni==='function' &&
        ulozLokalniTajneNastaveni(stage.novy,stage.uid)===true,'local_settings_update_failed');
      kontroluj(typeof media?.nastavKlicZHesla==='function','media_key_setter_missing');
      await media.nastavKlicZHesla(noveHeslo,{...stage.novy,userId:stage.uid});
      kontroluj(media.jeKlicDostupny?.()===true,'new_media_key_not_ready');
      kontroluj(typeof window.LubaNoteE2ECore?.recoveryPersistRootBox688A==='function',
        'local_root_storage_missing');
      await window.LubaNoteE2ECore.recoveryPersistRootBox688A(
        stage.novy.e2e_root_key_box,stage.uid,stage.novy.e2e_root_key_id);
      try {window.LubaNoteStartupDiag?.zapis?.('E2E','688J LOCAL KEYS UPDATED | media=READY root=STORED');}
      catch (_error) {}
      if(stage.secretOdemceny && typeof tajnySifrovaciKlic!=='undefined'){
        tajnySifrovaciKlic=stage.novySecretKlic;
      }
      // Android Keystore may contain an encrypted copy of the OLD master password.
      // Revoke that biometric unlock copy after the commit. The user may enable it
      // again with the new E2E password. Do not leave an obsolete credential behind.
      const bio=window.LubaNoteSecretBiometric;
      if(bio?.zjistiStav && bio?.vypniBiometrii){
        const stav=await bio.zjistiStav();
        if(stav?.configured===true){
          const vypnuto=await bio.vypniBiometrii({zobrazZpravu:false});
          kontroluj(vypnuto===true,'old_biometric_password_not_revoked');
        }
      }
      window.LubaNoteE2EDeviceGuard688T?.potvrdMistniZmenu?.(stage.uid,stage.novy.salt);
      return {ok:true,reason:'password_changed',notes:stage.noteZmeny.length,tags:stage.tagZmeny.length};
    } catch(error){
      if(potvrzeno){
        const duvod=String(error?.message||error?.code||'unknown_local_error');
        try {window.LubaNoteStartupDiag?.zapis?.('E2E','688J LOCAL FINISH FAIL | '+duvod.slice(0,100));}
        catch (_error) {}
      }
      return {ok:false,committed:potvrzeno,reason:potvrzeno?'server_changed_local_finishing_failed':String(error?.message||'change_failed')};
    } finally {
      if(docasnyKlient?.auth?.signOut) {
        try {await docasnyKlient.auth.signOut({scope:'local'});} catch(_e){}
      }
      window.LubaNoteE2EDeviceGuard688T?.konciMistniZmena?.();
      docasnyKlient=null;stage=null;probiha=false;
    }
  }
  let panel=null;
  let zmenaDokoncena688M=false;
  function open(){
    if(panel && panel.style.display!=='none')return;
    const t=jazyk();
    if(!panel){
      const el=document.createElement('div');
      el.id='ln688a-change-password';
      el.className='ln683BTSecurityOverlay ln688NChangeOverlay';
      el.setAttribute('aria-hidden','false');
      el.innerHTML=`<div class="ln683BTSecurityDialog ln688NChangeDialog" role="dialog"
          aria-modal="true" aria-labelledby="ln688NChangeTitle">
        <form class="ln688NChangeForm" autocomplete="off" novalidate>
          <h3 data-title id="ln688NChangeTitle"></h3>
          <p data-hint class="ln688NChangeHint"></p>
          <label><span data-label-account></span>
            <input class="ln683BTSecurityPassword" data-luba-keyboard-field="e2e-password" id="ln688b-account" type="password"
              autocomplete="current-password" required autocapitalize="off" spellcheck="false"></label>
          <label><span data-label-new></span>
            <input class="ln683BTSecurityPassword" data-luba-keyboard-field="e2e-password" id="ln688a-new" type="password"
              autocomplete="new-password" minlength="12" maxlength="1024" required
              autocapitalize="off" spellcheck="false"></label>
          <label><span data-label-repeat></span>
            <input class="ln683BTSecurityPassword" data-luba-keyboard-field="e2e-password" id="ln688a-confirm" type="password"
              autocomplete="new-password" minlength="12" maxlength="1024" required
              autocapitalize="off" spellcheck="false"></label>
          <p data-status class="ln683BTSecurityMessage ln688NChangeStatus" role="status"
             aria-live="polite"></p>
          <div class="ln683BTSecurityActions ln688NChangeActions">
            <button type="button" data-cancel></button><button type="submit" data-submit></button>
          </div>
        </form>
      </div>`;
      document.body.appendChild(el);
      const form=el.querySelector('form'),status=el.querySelector('[data-status]');
      const close=()=>{
        if(probiha)return;
        if(zmenaDokoncena688M){
          // 688M: reload only AFTER server and local success, on Done.
          window.location.reload();
          return;
        }
        form.reset();status.textContent='';el.style.display='none';
        el.setAttribute('aria-hidden','true');
        try{window.LubaNoteKeyboard?.skryjPoZavreniModalu?.();}catch(_e){}
      };
      el.querySelector('[data-cancel]').addEventListener('click',close);
      el.addEventListener('click',event=>{
        if(event.target===el && !zmenaDokoncena688M)close();
      });
      document.addEventListener('keydown',event=>{
        if(event.key==='Escape' && panel===el && el.style.display!=='none'
          && !probiha && !zmenaDokoncena688M){
          event.stopPropagation();close();
        }
      });
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if(probiha || zmenaDokoncena688M)return;
        const p=form.querySelector('#ln688a-new'),q=form.querySelector('#ln688a-confirm');
        const acct=form.querySelector('#ln688b-account');
        let pass=p.value,accountPass=acct.value;
        if(!accountPass){status.textContent=jazyk()[14];return;}
        if(pass!==q.value){status.textContent=jazyk()[6];return;}
        if(Array.from(pass).length<12){status.textContent=jazyk()[7];return;}
        p.value='';q.value='';acct.value='';
        const btn=form.querySelector('[data-submit]');
        btn.disabled=true;
        status.textContent=jazyk()[8];
        const r=await zmen(pass,accountPass,txt=>{status.textContent=txt;});
        pass='';accountPass='';btn.disabled=false;
        status.textContent=r.ok?jazyk()[9]:r.committed?jazyk()[10]:
          (r.reason==='sync_not_finished'?jazyk()[11]:r.reason==='same_password'?jazyk()[12]:
          'Změna nebyla provedena: '+r.reason);
        if(r.ok){
          zmenaDokoncena688M=true;
          btn.hidden=true;
          form.querySelector('[data-cancel]').textContent=jazyk()[15];
        }
      });
      panel=el;
    }
    const form=panel.querySelector('form');
    form.querySelector('[data-title]').textContent=t[0];
    form.querySelector('[data-hint]').textContent=t[5];
    form.querySelector('[data-label-new]').textContent=t[1];
    form.querySelector('[data-label-account]').textContent=t[13];
    form.querySelector('[data-label-repeat]').textContent=t[2];
    form.querySelector('[data-cancel]').textContent=t[4];
    form.querySelector('[data-submit]').textContent=t[3];
    form.querySelector('[data-status]').textContent='';
    zmenaDokoncena688M=false;
    form.querySelector('[data-submit]').hidden=false;
    form.reset();panel.style.display='flex';
    panel.setAttribute('aria-hidden','false');
    try{window.LubaNoteKeyboard?.skryjProModal?.();}catch(_e){}
    form.querySelector('#ln688b-account').focus();
  }
  window.LubaNoteE2EPasswordChange688A=Object.freeze({open,zmen});
})();
