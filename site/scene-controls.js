/* Shared mouse panning for the website's OrbitControls scenes. */
import { MOUSE, Vector3 } from './vendor/three-0.185.1/three.module.min.js';

export function enableScenePan(controls, canvas) {
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = MOUSE.PAN;
    const document = canvas.ownerDocument, camera = controls.object;
    const right = new Vector3(), up = new Vector3(), delta = new Vector3();
    let pointer = null, shifted = false;

    function beginShift(event) {
        pointer.shift = true;
        pointer.enabled = controls.enabled;
        controls.enabled = false;
        shifted = true;
        // A second mouse button produces pointermove, not another pointerdown.
        // Suspend native rotation for this gesture and rebase without a jump.
        pointer.x = event.clientX; pointer.y = event.clientY;
        controls.dispatchEvent({type:'start'});
    }
    function down(event) {
        if (event.pointerType !== 'mouse') { shifted = false; return; }
        if (!controls.enabled) return;
        pointer = {id:event.pointerId,x:event.clientX,y:event.clientY,shift:false};
        shifted = event.button === 2 || !!(event.buttons & 2);
        if ((event.buttons & 3) === 3) {
            beginShift(event);
            canvas.setPointerCapture(event.pointerId);
        }
    }
    function move(event) {
        if (!pointer || pointer.id !== event.pointerId) return;
        if (!pointer.shift && (event.buttons & 3) === 3) beginShift(event);
        if (!pointer.shift) return;
        event.preventDefault();
        const dx = event.clientX-pointer.x, dy = event.clientY-pointer.y;
        pointer.x = event.clientX; pointer.y = event.clientY;
        if (!dx && !dy) return;
        const scale = 2 * camera.position.distanceTo(controls.target) *
            Math.tan(camera.fov*Math.PI/360) / Math.max(1,canvas.clientHeight);
        camera.updateMatrix();
        right.setFromMatrixColumn(camera.matrix,0);
        up.setFromMatrixColumn(camera.matrix,1);
        delta.copy(right).multiplyScalar(-dx*scale).addScaledVector(up,dy*scale);
        camera.position.add(delta);
        controls.target.add(delta);
        controls.update();
    }
    function finish(event) {
        if (!pointer || (event && event.pointerId !== pointer.id)) return;
        const previous = pointer; pointer = null;
        if (previous.shift) {
            controls.enabled = previous.enabled;
            controls.dispatchEvent({type:'end'});
        }
    }
    function contextMenu(event) { event.preventDefault(); }
    canvas.addEventListener('pointerdown',down,true);
    document.addEventListener('pointermove',move,{capture:true,passive:false});
    document.addEventListener('pointerup',finish,true);
    document.addEventListener('pointercancel',finish,true);
    canvas.addEventListener('lostpointercapture',finish);
    canvas.addEventListener('contextmenu',contextMenu);
    return {
        wasShiftGesture: () => shifted,
        dispose() {
            finish();
            canvas.removeEventListener('pointerdown',down,true);
            document.removeEventListener('pointermove',move,true);
            document.removeEventListener('pointerup',finish,true);
            document.removeEventListener('pointercancel',finish,true);
            canvas.removeEventListener('lostpointercapture',finish);
            canvas.removeEventListener('contextmenu',contextMenu);
        }
    };
}
