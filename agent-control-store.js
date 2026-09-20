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
        var state=Model.initial(), mode='local', error='', uid=null, epoch=0, stop=null, listeners=[],remoteRaw=null,serverConfirmed=false,validationIssue=null,lastServerConfirmedAt=null;
        function snapshot(){return{state:state,mode:mode,error:error,uid:uid,serverConfirmed:serverConfirmed,validationIssue:validationIssue,lastServerConfirmedAt:lastServerConfirmedAt};}
        function issueFrom(e){
            if(!e||e.code!=='unsupported_lead_field'||!['stage','service','channel'].includes(e.field))return null;
            return{code:e.code,field:e.field,recordId:typeof e.recordId==='string'&&/^lead_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e.recordId)?e.recordId:null};
        }
        function emit(){listeners.forEach(function(fn){fn(snapshot());});}
        function localRead(){var raw=storage.getItem(LOCAL);return raw?Model.valid(JSON.parse(raw)):Model.initial();}
        function local(){serverConfirmed=false;validationIssue=null;try{state=localRead();mode='local';error='';}catch(e){mode='error';validationIssue=issueFrom(e);error='Local data could not be read. Export the raw backup before recovery.';}emit();}
        function setUser(user){
            epoch++; if(stop)stop();stop=null;uid=user?user.uid:null;state=Model.initial();error='';remoteRaw=null;serverConfirmed=false;validationIssue=null;lastServerConfirmedAt=null;
            if(!uid||!db){local();return;}
            mode='connecting';emit();var generation=epoch;
            var ref=db.collection('users').doc(uid).collection('data').doc('agentControl');
            stop=ref.onSnapshot({includeMetadataChanges:true},function(snap){
                if(generation!==epoch)return;
                // Connection state alone cannot prove the current document has committed.
                serverConfirmed=false;
                try{var data=snap.exists?snap.data().data:Model.initial();remoteRaw=JSON.stringify(data);state=Model.valid(data);error='';validationIssue=null;mode=snap.metadata&&snap.metadata.fromCache?'offline':'cloud';serverConfirmed=!!snap.metadata&&snap.metadata.fromCache===false&&snap.metadata.hasPendingWrites===false;
                    // Client observation time, not the document's update time or a claim about later cached data.
                    if(serverConfirmed)lastServerConfirmedAt=new Date().toISOString();
                }
                catch(e){mode='error';error=e.message;validationIssue=issueFrom(e);}emit();
            },function(e){if(generation!==epoch)return;serverConfirmed=false;validationIssue=null;mode='error';error='Cloud unavailable: '+(e.code||e.message)+'. Your local register has not been uploaded.';emit();});
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
        return {subscribe:function(fn){listeners.push(fn);fn(snapshot());},dispatch:dispatch,
            snapshot:snapshot,raw:function(){return uid?(remoteRaw||JSON.stringify(state)):storage.getItem(LOCAL)||JSON.stringify(state);},
            setUser:setUser,destroy:function(){epoch++;if(stop)stop();listeners=[];if(root.removeEventListener)root.removeEventListener('storage',storageListener);}};
    }
    root.AgentControlStore={create:create};
}(typeof window!=='undefined'?window:globalThis));
