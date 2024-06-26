
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let camera, scene, renderer, controls;
let depthTexture, depthTexture2, opaqueDepthTexture;
let renderTarget, compositeTarget;
let transparentGroup, opaqueGroup;
let copyQuad;
let infoContainer;
const clearColor = new THREE.Color();
const layers = [];

let frameTime = 0;
let frameSamples = 0;
let lastFrameStart = - 1;

const SAMPLES = 0;
const DEPTH_BUFFER = true;
const COLOR_SPACE = THREE.SRGBColorSpace;
const params = {

    useDepthPeeling: true,
    layers: 5,
    opacity: 0.5,
    doubleSided: true,

};

init();

async function init() {

    infoContainer = document.getElementById( 'info' );

    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.25, 20 );
    camera.position.set( 3, 2, 3 );

    scene = new THREE.Scene();

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setClearColor( 0x171717, 1 );
    document.body.appendChild( renderer.domElement );

    controls = new OrbitControls( camera, renderer.domElement );
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1;

    // set up textures
    depthTexture = new THREE.DepthTexture( 1, 1, THREE.FloatType );
    depthTexture2 = new THREE.DepthTexture( 1, 1, THREE.FloatType );
    opaqueDepthTexture = new THREE.DepthTexture( 1, 1, THREE.FloatType );

    renderTarget = new THREE.WebGLRenderTarget( 1, 1, {
        colorSpace: COLOR_SPACE,
        depthBuffer: DEPTH_BUFFER,
        samples: SAMPLES,
    } );
    compositeTarget = new THREE.WebGLRenderTarget( 1, 1, {
        colorSpace: COLOR_SPACE,
        depthBuffer: DEPTH_BUFFER,
        samples: SAMPLES,
    } );

    // set up quad
    copyQuad = new FullScreenQuad( new THREE.MeshBasicMaterial() );

    transparentGroup = new THREE.Group();
    opaqueGroup = new THREE.Group();
    scene.add( transparentGroup, opaqueGroup );

    let modelPromise = null;
    const DepthPeelMaterial = DepthPeelMaterialMixin( THREE.MeshStandardMaterial );
    if ( window.location.hash.includes( 'drone' ) ) {

        modelPromise = new GLTFLoader()
            .setMeshoptDecoder( MeshoptDecoder )
            .loadAsync( 'https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/models/drone/drone.glb' )
            .then( gltf => {

                gltf.scene.scale.setScalar( 10 );
                gltf.scene.updateMatrixWorld();

                const opaqueObjects = [];
                gltf.scene.traverse( c => {

                    if ( c.material ) {

                        const material = new DepthPeelMaterial();
                        material.copy( c.material );
                        material.opacity = 0.5;
                        material.transparent = true;
                        c.material = material;

                        if ( c.material.color.r > 0.8 && c.material.color.g < 0.4 && c.material.color.b < 0.4 ) {

                            material.opacity = 1;
                            material.transparent = false;
                            material.emissive.copy( material.color );
                            material.emissiveIntensity = 0.5;
                            opaqueObjects.push( c );

                        }

                    }

                } );

                opaqueObjects.forEach( c => opaqueGroup.attach( c ) );

                transparentGroup.add( gltf.scene );

            } );

    } else {

        modelPromise = new GLTFLoader()
        .setMeshoptDecoder( MeshoptDecoder )
        .loadAsync( 'https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/models/vilhelm-13/vilhelm_13.glb' )
        .then( gltf => {

            gltf.scene.scale.setScalar( 0.025 );
            gltf.scene.rotation.y += Math.PI;

            new THREE.Box3()
                .setFromObject( gltf.scene )
                .getCenter( gltf.scene.position )
                .multiplyScalar( - 1 );

            gltf.scene.updateMatrixWorld();

            gltf.scene.traverse( c => {

                if ( c.material ) {

                    const material = new DepthPeelMaterial();
                    material.copy( c.material );
                    material.opacity = 0.5;
                    material.transparent = true;
                    c.material = material;

                }

            } );

            transparentGroup.add( gltf.scene );

        } );

    }

    const envPromise = await new RGBELoader()
        .loadAsync( 'https://raw.githubusercontent.com/gkjohnson/3d-demo-data/master/hdri/leadenhall_market_1k.hdr' )
        .then( tex => {

            tex.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = tex;

        } );

    await Promise.all( [ modelPromise, envPromise ] );

    renderer.setAnimationLoop( animate );

    const gui = new GUI();
    gui.add( params, 'useDepthPeeling' );
    gui.add( params, 'doubleSided' );
    gui.add( params, 'opacity', 0, 1 );
    gui.add( params, 'layers', 1, 10, 1 );

    window.addEventListener( 'resize', onWindowResize );
    onWindowResize();

}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio;
    renderer.setSize( w, h );
    renderer.setPixelRatio( dpr );

    compositeTarget.setSize( dpr * w, dpr * h );
    renderTarget.setSize( dpr * w, dpr * h );

    layers.forEach( rt => rt.dispose() );
    layers.length = 0;

    depthTexture.image.width = dpr * w;
    depthTexture.image.height = dpr * h;
    depthTexture.dispose();

    depthTexture2.image.width = dpr * w;
    depthTexture2.image.height = dpr * h;
    depthTexture2.dispose();

    opaqueDepthTexture.image.width = dpr * w;
    opaqueDepthTexture.image.height = dpr * h;
    opaqueDepthTexture.dispose();

}

//
function animate() {

    let frameDelta;
    if ( lastFrameStart === - 1 ) {

        lastFrameStart = window.performance.now();

    } else {

        frameDelta = window.performance.now() - lastFrameStart;
        frameTime += ( frameDelta - frameTime ) / ( frameSamples + 1 );
        if ( frameSamples < 60 ) {
        
            frameSamples ++

        }

        lastFrameStart = window.performance.now();

    }

    controls.update();
    renderer.info.autoReset = false;

    if ( params.useDepthPeeling ) {

        depthPeelRender();

    } else {

        render();

    }

    infoContainer.innerText = 
        `Draw Calls: ${ renderer.info.render.calls }\n` +
        `Frame Time: ${ frameTime.toFixed( 2 ) }ms\n` +
        `FPS       : ${ ( 1000 / frameTime ).toFixed( 2 ) }`;
    renderer.info.reset();

}

function render() {

    transparentGroup.traverse( ( { material } ) => {

        if ( material ) {

            material.enableDepthPeeling = false;
            material.opaqueDepth = null;
            material.nearDepth = null;
            material.blending = THREE.NormalBlending;
            material.depthWrite = false;
            material.opacity = params.opacity;
            material.side = params.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
            material.forceSinglePass = false;

        }

    } );

    opaqueGroup.visible = true;
    transparentGroup.visible = true;
    renderer.render( scene, camera );

}

function depthPeelRender() {

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio;
    while ( layers.length < params.layers ) {

        layers.push( new THREE.WebGLRenderTarget( w * dpr, h * dpr, {
            colorSpace: COLOR_SPACE,
            depthBuffer: DEPTH_BUFFER,
            samples: SAMPLES,
        } ) );

    }

    while ( layers.length > params.layers ) {

        layers.pop().dispose();

    }

    opaqueGroup.visible = true;
    transparentGroup.visible = false;
    renderTarget.depthTexture = opaqueDepthTexture;
    renderer.setRenderTarget( renderTarget );
    renderer.render( scene, camera );
    renderer.setRenderTarget( null );

    // render opaque layer
    copyQuad.material.map = renderTarget.texture;
    copyQuad.material.blending = THREE.NoBlending;
    copyQuad.material.transparent = false;
    copyQuad.material.depthTest = false;
    copyQuad.material.depthWrite = false;
    copyQuad.render( renderer );
    renderTarget.depthTexture = null;

    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor( clearColor );

    // perform depth peeling
    for ( let i = 0; i < params.layers; i ++ ) {

        opaqueGroup.visible = false;
        transparentGroup.visible = true;

        const depthTextures = [ depthTexture, depthTexture2 ];
        const writeDepthTexture = depthTextures[ ( i + 1 ) % 2 ];
        const nearDepthTexture = depthTextures[ i % 2 ];

        // update the materials, skipping the near check
        transparentGroup.traverse( ( { material } ) => {

            if ( material ) {

                material.enableDepthPeeling = true;
                material.opaqueDepth = opaqueDepthTexture;
                material.nearDepth = i === 0 ? null : nearDepthTexture;
                material.blending = THREE.CustomBlending;
                material.blendDst = THREE.ZeroFactor;
                material.blendSrc = THREE.OneFactor;
                material.depthWrite = true;
                material.opacity = params.opacity;
                material.side = params.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
                material.forceSinglePass = true;

                renderer.getDrawingBufferSize( material.resolution );

            }

        } );

        // perform rendering
        let currTarget = i === 0 ? compositeTarget : renderTarget;
        currTarget = layers[ i ];
        currTarget.depthTexture = writeDepthTexture;

        renderer.setRenderTarget( currTarget );
        renderer.setClearColor( 0, 0 );
        renderer.render( scene, camera );
        renderer.setRenderTarget( null );

    }

    renderer.setClearColor( clearColor, clearAlpha );

    // render transparent layers
    for ( let i = params.layers - 1; i >= 0; i -- ) {

        renderer.autoClear = false;
        layers[ i ].depthTexture = null;
        copyQuad.material.map = layers[ i ].texture;
        copyQuad.material.blending = THREE.NormalBlending;
        copyQuad.material.transparent = true;
        copyQuad.material.depthTest = false;
        copyQuad.material.depthWrite = false;
        copyQuad.render( renderer );

    }

    renderer.autoClear = true;

}

function DepthPeelMaterialMixin( baseMaterial ) {

    return class extends baseMaterial {

        get nearDepth() {

            return this._uniforms.nearDepth.value;

        }

        set nearDepth( v ) {

            this._uniforms.nearDepth.value = v;
            this.needsUpdate = true;

        }

        get opaqueDepth() {

            return this._uniforms.opaqueDepth.value;

        }

        set opaqueDepth( v ) {

            this._uniforms.opaqueDepth.value = v;

        }

        get enableDepthPeeling() {

            return this._enableDepthPeeling;

        }

        set enableDepthPeeling( v ) {

            if ( this._enableDepthPeeling !== v ) {

                this._enableDepthPeeling = v;
                this.needsUpdate = true;

            }

        }

        get resolution() {

            return this._uniforms.resolution.value;

        }

        constructor( ...args ) {

            super( ...args );

            this._firstPass = false;
            this._enableDepthPeeling = false;

            this._uniforms = {

                nearDepth: { value: null },
                opaqueDepth: { value: null },
                resolution: { value: new THREE.Vector2() },

            };

        }

        customProgramCacheKey() {

            return `${ Number( this.enableDepthPeeling ) }|${ Number( this.nearDepth ) }`;

        }

        onBeforeCompile( shader ) {

            shader.uniforms = {
                ...shader.uniforms,
                ...this._uniforms,
            };

            shader.fragmentShader =
                /* glsl */`
                    #define DEPTH_PEELING ${ Number( this.enableDepthPeeling ) }
                    #define FIRST_PASS ${ Number( ! this.nearDepth ) }
                    
                    #if DEPTH_PEELING
                    
                    uniform sampler2D nearDepth;
                    uniform sampler2D opaqueDepth;
                    uniform vec2 resolution;

                    #endif

                    ${ shader.fragmentShader }
                `.replace( 'void main() {', /* glsl */`
                
                    void main() {

                        #if DEPTH_PEELING

                        vec2 screenUV = gl_FragCoord.xy / resolution;

                        if ( texture2D( opaqueDepth, screenUV ).r < gl_FragCoord.z ) {

                            discard;

                        }

                        #if ! FIRST_PASS

                        if ( texture2D( nearDepth, screenUV ).r >= gl_FragCoord.z - 1e-6 ) {

                            discard;

                        }
                        
                        #endif

                        #endif

                ` );

        }

    };

}
