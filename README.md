# depth-peeling-demo

Demonstration of [depth peeling](https://developer.download.nvidia.com/assets/gamedev/docs/OrderIndependentTransparency.pdf) in three.js in support for adding re-assignable depth buffers for render targets.

[Robot demo here](https://gkjohnson.github.io/depth-peeling-demo/)

[Drone CAD demo here](https://gkjohnson.github.io/depth-peeling-demo/#drone)

Drone model by [T Flex CAD on SketchFab](https://sketchfab.com/3d-models/drone-c5dfafed7f5a4003a25e8e22a5e701d9). Robot model by [artjamayka on SketchFab](https://sketchfab.com/3d-models/vilhelm-13-low-res-textures-cb49a1f71ba54cad8e9dc09da8ef47cd).

**Possible Improvements**
- Try stenciling the model area to see if performance improves with lots of layers
- Composite into a common buffer on every layer render
- Perform a depth prepass per layer to avoid discarding expensive fragments
- Limit render viewport to avoid copying and blending of of unused pixels
- Add an epsilon to reduce z fighting on depth comparisons on certain hardware
