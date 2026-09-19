/* Uses a dedicated transactional document within the app's existing owner-only data path.
 * SyncEngine ignores this unregistered key; it must never blind-write this document.
 * Anonymous local work is separate and is never automatically copied into a signed-in account.
 */
(function(root){
    'use strict';
    var Model=root.AgentControlModel, LOCAL='protonAgentControlLocal_v1';
    function create(options) {
        options=options||{};
        var storage=options.storage||root.localStorage, db=options.db||null, auth=options.auth||null;
        var state=Model.initial(), mode='local', error='', uid=null, epoch=0, stop=null, listeners=[],remoteRaw=null;
        function emit(){listeners.forEach(function(fn){fn({state:state,mode:mode,error:error,uid:uid});});}
        function localRead(){var raw=storage.getItem(LOCAL);return raw?Model.valid(JSON.parse(raw)):Model.initial();}
        function local(){try{state=localRead();mode='local';error='';}catch(e){mode='error';error='Local data could not be read. Export the raw backup before recovery.';}emit();}
        function setUser(user){
            epoch++; if(stop)stop();stop=null;uid=user?user.uid:null;state=Model.initial();error='';remoteRaw=null;
            if(!uid||!db){local();return;}
            mode='connecting';emit();var generation=epoch;
            var ref=db.collection('users').doc(uid).collection('data').doc('agentControl');
            stop=ref.onSnapshot({includeMetadataChanges:true},function(snap){
                if(generation!==epoch)return;
                try{var data=snap.exists?snap.data().data:Model.initial();remoteRaw=JSON.stringify(data);state=Model.valid(data);error='';mode=snap.metadata&&snap.metadata.fromCache?'offline':'cloud';}
                catch(e){mode='error';error=e.message;}emit();
            },function(e){if(generation!==epoch)return;mode='error';error='Cloud unavailable: '+(e.code||e.message)+'. Your local register has not been uploaded.';emit();});
        }
        async function dispatch(action){
            if(mode==='error'||mode==='connecting'||mode==='offline')throw new Error('Wait for a confirmed cloud connection or recover the current register before changing it.');
            var generation=epoch, owner=uid;
            if(mode==='cloud') {
                var ref=db.collection('users').doc(owner).collection('data').doc('agentControl');
                await db.runTransaction(async function(tx){
                    if(generation!==epoch||uid!==owner)throw new Error('The signed-in account changed.');
                    var snap=await tx.get(ref);
                    if(generation!==epoch||uid!==owner)throw new Error('The signed-in account changed.');
                    var before=snap.exists?Model.valid(snap.data().data):Model.initial();
                    var next=Model.reduce(before,action);
                    tx.set(ref,{data:next,updatedAt:action.at});
                });
                if(generation!==epoch)throw new Error('The account changed while saving; check the original account for the result.');
            } else {
                var save=function(){
                    if(generation!==epoch||uid!==owner||mode!=='local')throw new Error('The workspace changed while waiting to save. Refresh and try again.');
                    var before=localRead();var next=Model.reduce(before,action);storage.setItem(LOCAL,JSON.stringify(next));state=next;emit();
                };
                // Browser-wide lock closes the read/write race between local tabs.
                if(root.navigator&&root.navigator.locks)await root.navigator.locks.request(LOCAL,save);else save();
            }
        }
        var storageListener=function(e){if(!uid && e.key===LOCAL)local();};
        if(root.addEventListener)root.addEventListener('storage',storageListener);
        local();
        if(auth)auth.onAuthStateChanged(setUser);
        return {subscribe:function(fn){listeners.push(fn);fn({state:state,mode:mode,error:error,uid:uid});},dispatch:dispatch,
            snapshot:function(){return{state:state,mode:mode,error:error,uid:uid};},raw:function(){return uid?(remoteRaw||JSON.stringify(state)):storage.getItem(LOCAL)||JSON.stringify(state);},
            setUser:setUser,destroy:function(){epoch++;if(stop)stop();listeners=[];if(root.removeEventListener)root.removeEventListener('storage',storageListener);}};
    }
    root.AgentControlStore={create:create};
}(typeof window!=='undefined'?window:globalThis));
