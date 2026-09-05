Three.js 0.185.1, MIT license (see LICENSE).
Source: https://registry.npmjs.org/three/-/three-0.185.1.tgz

three.module.min.js and three.core.min.js are the official build files.
OrbitControls.js and RoomEnvironment.js are the official addons with the
bare 'three' import changed to './three.module.min.js' for local static hosting.

These versioned files are loaded only when Build your mine is opened.
No CDN requests are made by the 3D renderer. Update the directory name and
imports together when upgrading so caches cannot combine library versions.
