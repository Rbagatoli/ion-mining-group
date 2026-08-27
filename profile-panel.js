// ===== PROTON MINING — Profile Panel =====
// Slide-out panel with account info, data export, sign out, and account management.

(function() {
    var panelOpen = false;

    function injectProfilePanel() {
        var backdrop = document.createElement('div');
        backdrop.id = 'profileBackdrop';
        backdrop.className = 'profile-backdrop';
        backdrop.addEventListener('click', hidePanel);
        document.body.appendChild(backdrop);

        var panel = document.createElement('div');
        panel.id = 'profilePanel';
        panel.className = 'profile-panel';
        panel.innerHTML =
            '<div class="profile-header">' +
                '<h3>Account</h3>' +
                '<button class="profile-close-btn" id="profileCloseBtn">&times;</button>' +
            '</div>' +
            '<div class="profile-body">' +
                '<div class="profile-user-info" id="profileUserInfo"></div>' +
                '<div class="profile-actions">' +
                    '<button class="profile-action-btn" id="profileExportBtn">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
                        'Export All Data' +
                    '</button>' +
                    '<button class="profile-action-btn" id="profileImportBtn">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
                        'Restore From File' +
                    '</button>' +
                    '<input type="file" id="profileImportInput" accept="application/json,.json" hidden>' +
                    '<button class="profile-action-btn" id="profileDeleteDataBtn">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
                        'Delete Cloud Data' +
                    '</button>' +
                    '<button class="profile-action-btn profile-signout-btn" id="profileSignOutBtn">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
                        'Sign Out' +
                    '</button>' +
                    '<button class="profile-action-btn profile-danger-btn" id="profileDeleteAccountBtn">' +
                        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
                        'Delete Account' +
                    '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(panel);

        document.getElementById('profileCloseBtn').addEventListener('click', hidePanel);
        document.getElementById('profileExportBtn').addEventListener('click', exportAllData);
        document.getElementById('profileImportBtn').addEventListener('click', function() {
            document.getElementById('profileImportInput').click();
        });
        document.getElementById('profileImportInput').addEventListener('change', importFromFile);
        document.getElementById('profileDeleteDataBtn').addEventListener('click', deleteCloudData);
        document.getElementById('profileSignOutBtn').addEventListener('click', handleSignOut);
        document.getElementById('profileDeleteAccountBtn').addEventListener('click', handleDeleteAccount);

        // Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && panelOpen) hidePanel();
        });
    }

    async function showPanel() {
        panelOpen = true;
        await renderUserInfo();
        document.getElementById('profilePanel').classList.add('open');
        document.getElementById('profileBackdrop').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function hidePanel() {
        panelOpen = false;
        document.getElementById('profilePanel').classList.remove('open');
        document.getElementById('profileBackdrop').classList.remove('open');
        document.body.style.overflow = '';
    }

    async function renderUserInfo() {
        var user = ProtonAuth.getUser();
        if (!user) return;

        // ===== NEW: Reload user from Firebase to get fresh verification status =====
        try {
            await user.reload();
            user = ProtonAuth.getUser(); // Get refreshed user object
        } catch (err) {
            console.warn('[Profile] Failed to reload user:', err);
        }
        // ============================================================================

        var initial = (user.displayName || user.email || '?').charAt(0).toUpperCase();
        var name = user.displayName || 'No name set';
        var email = user.email || '';

        var provider = 'Email';
        if (user.providerData && user.providerData.length > 0) {
            var pid = user.providerData[0].providerId;
            if (pid === 'google.com') provider = 'Google';
        }

        var verifiedHtml = '';
        if (provider === 'Email') {
            if (user.emailVerified) {
                verifiedHtml =
                    '<div class="profile-verified">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--pos)" stroke-width="2">' +
                            '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                            '<polyline points="22 4 12 14.01 9 11.01"/>' +
                        '</svg> Email verified' +
                    '</div>';
            } else {
                verifiedHtml =
                    '<div class="profile-unverified">' +
                        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<circle cx="12" cy="12" r="10"/>' +
                            '<line x1="12" y1="8" x2="12" y2="12"/>' +
                            '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
                        '</svg> Email not verified ' +
                        '<a href="#" id="profileResendVerify">Resend</a>' +
                    '</div>';
            }
        }

        var container = document.getElementById('profileUserInfo');
        container.innerHTML =
            '<div class="profile-avatar">' + initial + '</div>' +
            '<div class="profile-name">' + escapeHtml(name) + '</div>' +
            '<div class="profile-email">' + escapeHtml(email) + '</div>' +
            '<div class="profile-provider-badge">' + provider + '</div>' +
            verifiedHtml;

        var resendLink = document.getElementById('profileResendVerify');
        if (resendLink) {
            resendLink.addEventListener('click', function(e) {
                e.preventDefault();
                resendLink.textContent = 'Sending...';
                resendLink.style.pointerEvents = 'none';
                ProtonAuth.resendVerification().then(function() {
                    resendLink.textContent = 'Sent! Check inbox & spam.';
                    resendLink.style.color = 'var(--pos)';
                }).catch(function(err) {
                    console.error('Resend verification failed:', err.code, err.message);
                    var msg = 'Failed';
                    if (err.code === 'auth/too-many-requests') msg = 'Too many attempts — try later';
                    else if (err.message) msg = err.message;
                    resendLink.textContent = msg;
                    resendLink.style.color = 'var(--neg)';
                    setTimeout(function() {
                        resendLink.textContent = 'Resend';
                        resendLink.style.color = '';
                        resendLink.style.pointerEvents = '';
                    }, 5000);
                });
            });
        }
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Everything this app stores, not just what it syncs.
    //
    // This used to iterate SyncEngine.SYNC_KEYS — 11 keys of the 28 the app actually writes — so
    // the single backup affordance in the product omitted exactly the same things the cloud
    // omitted: the prospect portfolio, saved scenarios, the source selection, widget layouts,
    // the Strike balance. A user doing the responsible thing before a risky operation got a file
    // that silently left out more than half their state.
    //
    // Prefix-driven rather than a list, so a key added later is covered without anyone
    // remembering to add it here. The export is keyed by the REAL localStorage key so a restore
    // needs no translation table.
    // THE PREFIX LIST AND THE KEY WALK NOW LIVE IN backup.js, alongside the restore that has to
    // agree with them exactly. They were here, and the CRM layer's protonCrm prefix fell outside
    // them silently -- six stores, including the register of executed agreements, outside the one
    // backup affordance in the product for as long as they existed. Same class of bug as the
    // 11-of-28 one the paragraph above records, found the same way: by counting.
    //
    // Moving them also made them testable. tests/storage.test.js had to reproduce the list
    // locally "because profile-panel.js needs a DOM to load", and a reproduced list is what let
    // a test called "the export covers every key" stay green while it covered a third of them.

    function download(text, name) {
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function stamp() { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); }

    function exportAllData() {
        download(ProtonBackup.serialize(ProtonBackup.collect(localStorage)),
                 'proton-mining-data-' + new Date().toISOString().slice(0, 10) + '.json');
    }

    /* RESTORE. The counterpart the export has been missing, which made the one backup affordance
       in the product a one-way door.
     *
       Everything that decides anything lives in backup.js and is tested in node against a real
       storage shim -- this function is the file picker, the sentence the user reads, and the
       download of the safety copy. The split is deliberate: a restore that can overwrite a
       ledger must not be testable only by re-implementing it, which is how the export came to
       have a green test while six stores sat outside it. */
    function importFromFile(ev) {
        var input = ev.target;
        var file = input.files && input.files[0];
        // Cleared immediately so choosing the same file twice in a row still fires a change.
        input.value = '';
        if (!file) return;

        var reader = new FileReader();
        reader.onerror = function() { alert('That file could not be read.'); };
        reader.onload = function() {
            var parsed;
            try {
                parsed = JSON.parse(String(reader.result));
            } catch (e) {
                alert('That file is not valid JSON, so nothing was restored.');
                return;
            }

            /* VALIDATED IN FULL BEFORE ANYTHING IS SHOWN, let alone written. If any key fails,
               the user is told what is wrong with the file rather than being asked to confirm a
               restore that would then half-happen. */
            var check = ProtonBackup.inspect(parsed, localStorage);
            if (!check.ok) { alert(check.err); return; }

            /* WHAT IS ABOUT TO BE REPLACED, per key, with counts on both sides. "Restore this
               backup?" is not a question anyone can answer; "sites: 47 records become 12" is. */
            var lines = check.plan.map(function(p) {
                return p.action === 'create'
                    ? '  ' + p.key + ': not present now, ' + p.after + ' restored'
                    : '  ' + p.key + ': ' + p.before + ' now, ' + p.after + ' after';
            });
            var untouched = ProtonBackup.exportableKeys(localStorage).filter(function(k) {
                for (var i = 0; i < check.plan.length; i++) if (check.plan[i].key === k) return false;
                return true;
            });
            var msg = 'Restore ' + check.plan.length + ' store' +
                      (check.plan.length === 1 ? '' : 's') + ' from this file?\n\n' +
                      lines.join('\n') + '\n\n' +
                      (untouched.length
                        ? untouched.length + ' other store' + (untouched.length === 1 ? ' is' : 's are') +
                          ' not in this file and will be left as they are.\n\n'
                        : '') +
                      'Each store is REPLACED, not merged. A copy of your current data will ' +
                      'download first.';
            if (!confirm(msg)) return;

            /* The safety copy is not optional and not a checkbox. Restoring an old backup over
               recent work is the obvious way to lose data here, and it is the one the user is
               least likely to have anticipated at the moment they click. */
            var res = ProtonBackup.apply(parsed, localStorage, function(snapshot) {
                download(ProtonBackup.serialize(snapshot),
                         'proton-mining-before-restore-' + stamp() + '.json');
            });

            if (!res.ok) { alert(res.err); return; }
            alert('Restored ' + res.written.length + ' store' +
                  (res.written.length === 1 ? '' : 's') + '. The page will reload.');
            location.reload();
        };
        reader.readAsText(file);
    }

    function deleteCloudData() {
        if (!confirm('Delete all your cloud data? Your local data will be kept.')) return;

        var user = ProtonAuth.getUser();
        if (!user || typeof firebase === 'undefined') return;

        var db = firebase.firestore();
        var ref = db.collection('users').doc(user.uid).collection('data');
        ref.get().then(function(snapshot) {
            var batch = db.batch();
            snapshot.forEach(function(doc) { batch.delete(doc.ref); });
            return batch.commit();
        }).then(function() {
            SyncEngine.stopAll();
            alert('Cloud data deleted.');
        }).catch(function(err) {
            alert('Failed to delete cloud data: ' + err.message);
        });
    }

    function handleSignOut() {
        // Signing out no longer wipes the device (see shared.js), so this confirmation is no
        // longer guarding against destruction — it guards against losing the SYNC. Worth asking
        // anyway: the button sits directly below "Delete Cloud Data", and pressing the two in
        // sequence used to be total, irreversible loss behind a message that said the opposite.
        if (!confirm('Sign out of sync?\n\nYour data stays on this device. Changes made while ' +
                     'signed out will not reach your other devices until you sign back in.')) return;
        SyncEngine.stopAll();
        ProtonAuth.signOut();
        hidePanel();
    }

    function handleDeleteAccount() {
        if (!confirm('Permanently delete your account and all cloud data? This cannot be undone.')) return;
        if (!confirm('Are you sure? This action is permanent.')) return;

        var user = ProtonAuth.getUser();
        if (!user || typeof firebase === 'undefined') return;

        var db = firebase.firestore();
        var ref = db.collection('users').doc(user.uid).collection('data');
        ref.get().then(function(snapshot) {
            var batch = db.batch();
            snapshot.forEach(function(doc) { batch.delete(doc.ref); });
            return batch.commit();
        }).then(function() {
            SyncEngine.stopAll();
            return ProtonAuth.deleteAccount();
        }).then(function() {
            hidePanel();
            alert('Account deleted.');
            location.reload();
        }).catch(function(err) {
            if (err.code === 'auth/requires-recent-login') {
                alert('For security, please sign out and sign back in, then try again.');
            } else {
                alert('Failed to delete account: ' + err.message);
            }
        });
    }

    // ===== INIT =====
    injectProfilePanel();

    // Auto-refresh profile when user returns to window (e.g., after clicking email verification link)
    window.addEventListener('focus', function() {
        if (document.getElementById('profilePanel').classList.contains('open')) {
            renderUserInfo();
        }
    });

    // ===== PUBLIC API =====
    window.ProtonProfile = {
        show: showPanel,
        hide: hidePanel
    };
})();
