import * as THREE from '../../libs/three137/three.module.js';
import { GLTFLoader } from '../../libs/three137/GLTFLoader.js';
import { RGBELoader } from '../../libs/three137/RGBELoader.js';
import { NPCHandler } from './NPCHandler.js';
import { LoadingBar } from '../../libs/LoadingBar.js';
import { Pathfinding } from '../../libs/pathfinding/Pathfinding.js';
import { User } from './User.js';
import { Controller } from './Controller.js';
import { BulletHandler } from './BulletHandler.js';
import { UI } from './UI.js';
import { EffectComposer } from '../../libs/three137/pp/EffectComposer.js';
import { RenderPass } from '../../libs/three137/pp/RenderPass.js';
import { ShaderPass } from '../../libs/three137/pp/ShaderPass.js';
import { GammaCorrectionShader } from '../../libs/three137/pp/GammaCorrectionShader.js';
import { Tween } from '../../libs/Toon3D.js';
import { SFX } from '../../libs/SFX.js';
import { Star } from './Star.js'

class Game{
	constructor(){
		const container = document.createElement( 'div' );
		document.body.appendChild( container );
        
		this.clock = new THREE.Clock();

        this.loadingBar = new LoadingBar();
        this.loadingBar.visible = false;

		this.assetsPath = '../../assets/';
        
		this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 500 );
		this.camera.position.set( -10.6, 1.6, -1.46 );
		//this.camera.position.set( -10.6, 1.6, -3.5 );
		this.camera.rotation.y = -Math.PI*0.6;

		let col = 0x201510;
		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color( col );
		this.scene.fog = new THREE.Fog( col, 100, 200 );

		const ambient = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
		this.scene.add(ambient);

        const light = new THREE.DirectionalLight();
        light.position.set( 4, 20, 20 );
		light.target.position.set(-2, 0, 0);
		light.castShadow = true;
		//Set up shadow properties for the light
		light.shadow.mapSize.width = 1024; 
		light.shadow.mapSize.height = 512; 
		light.shadow.camera.near = 0.5; 
		light.shadow.camera.far = 60;
		const d = 30; 
		light.shadow.camera.left = -d;
		light.shadow.camera.bottom = -d*0.25;
		light.shadow.camera.right = light.shadow.camera.top = d;
		this.scene.add(light);
		this.light = light;
	
		this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true } );
		this.renderer.shadowMap.enabled = true;
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
        this.renderer.outputEncoding = THREE.sRGBEncoding;
		container.appendChild( this.renderer.domElement );
        this.setEnvironment();
		this.initPostProcessing();
		this.load();

		this.raycaster = new THREE.Raycaster();
		this.tmpVec = new THREE.Vector3();

		this.active = false;
		window.addEventListener( 'resize', this.resize.bind(this) );
		this.stars = [];
		this.treasureCount = 0;
		this.addStars();
	}

	initPostProcessing(){
		this.composer = new EffectComposer( this.renderer );
  		const renderPass = new RenderPass( this.scene, this.camera );
  		this.composer.addPass( renderPass );
		const gammaCorrectionPass = new ShaderPass( GammaCorrectionShader );
		this.composer.addPass( gammaCorrectionPass );

		const tintShader = {

			uniforms: {
		
				'tDiffuse': { value: null },
				'strength': { value: 0.0 }
		
			},
		
			vertexShader: /* glsl */`
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
		
			fragmentShader: /* glsl */`
				uniform float strength;
				uniform sampler2D tDiffuse;
				varying vec2 vUv;
				void main() {
					vec3 texel = texture2D(tDiffuse, vUv).rgb;
					vec3 tintColor = vec3(1.0, 0.3, 0.3);
					float luminance = (texel.r + texel.g + texel.b)/3.0;
					vec3 tint = tintColor * luminance * 1.8;
					vec3 color = mix(texel, tint, clamp(strength, 0.0, 1.0));
					gl_FragColor = vec4(color, 1.0);
				}`
		
		}; 
		this.tintPass = new ShaderPass( tintShader );
		this.composer.addPass( this.tintPass );	  
	}

	tintScreen(action){
		this.tintPass.uniforms.strength.value = 1; 
		const duration = (action=='shot') ? 3.0 : 1.5;
		this.tween = new Tween( this.tintPass.uniforms.strength, 'value', 0, duration, this.removeTween.bind(this));
	}

	removeTween(){
		delete this.tween;
	}

	startGame(){
		this.user.reset();
		this.npcHandler.reset();
		this.ui.ammo = 1;
		this.ui.health = 1;
		this.active = true;
		this.controller.cameraBase.getWorldPosition(this.camera.position);
        this.controller.cameraBase.getWorldQuaternion(this.camera.quaternion);
		this.sfx.play('atmos');
	}

	seeUser(pos, seethrough=false){
		if (this.seethrough){
			this.seethrough.forEach( child => {
				child.material.transparent = false;
				child.material.opacity = 1;
				//child.visible = true;
			});
			delete this.seethrough;
		}

		this.tmpVec.copy(this.user.position).sub(pos).normalize();
		this.raycaster.set(pos, this.tmpVec);

		const intersects = this.raycaster.intersectObjects(this.factory.children, true);
		let userVisible = true;

		if (intersects.length>0){
			const dist = this.tmpVec.copy(this.user.position).distanceTo(pos);
			
			if (seethrough){
				this.seethrough = [];
				intersects.some( intersect => {
					if (intersect.distance < dist){
						this.seethrough.push(intersect.object);
						//intersect.object.visible = false;
						intersect.object.material.transparent = true;
						intersect.object.material.opacity = 0.3;
					}else{
						return true;
					}
				});
			}else{
				userVisible = (intersects[0].distance > dist);
			}
			
		}

		return userVisible;
	}

	gameover(){
		this.active = false;
		this.ui.showGameover();
		this.sfx.stop('atmos');
	}

	initPathfinding(navmesh){
		this.waypoints = [
			new THREE.Vector3(17.73372016326552, 0.39953298254866443, -0.7466724607286782),
			new THREE.Vector3(20.649478054772402, 0.04232912113775987, -18.282935518174437),
			new THREE.Vector3(11.7688416798274, 0.11264635905666916, -23.23102176233945),
			new THREE.Vector3(-3.111551689570482, 0.18245423057147991, -22.687392486867505),
			new THREE.Vector3(-13.772447796604245, 0.1260277454451636, -23.12237117145656),
			new THREE.Vector3(-20.53385139415452, 0.0904175187063471, -12.467546107992108),
			new THREE.Vector3(-18.195950790753532, 0.17323640676321908, -0.9593366354062719),
			new THREE.Vector3(-6.603208729295872, 0.015786387893574227, -12.265553884212125)
		];
		this.pathfinder = new Pathfinding();
        this.pathfinder.setZoneData('factory', Pathfinding.createZone(navmesh.geometry, 0.02));
		if (this.npcHandler.gltf !== undefined) this.npcHandler.initNPCs();
	}
	
    resize(){
        this.camera.aspect = window.innerWidth / window.innerHeight;
    	this.camera.updateProjectionMatrix();
    	this.renderer.setSize( window.innerWidth, window.innerHeight ); 
    }
    
    setEnvironment(){
        const loader = new RGBELoader().setPath(this.assetsPath);
        const pmremGenerator = new THREE.PMREMGenerator( this.renderer );
        pmremGenerator.compileEquirectangularShader();
        
        loader.load( 'hdr/factory.hdr', 
		texture => {
          const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
          pmremGenerator.dispose();

          this.scene.environment = envMap;

		  this.loadingBar.visible = !this.loadingBar.loaded;
        }, 
		xhr => {
			this.loadingBar.update( 'envmap', xhr.loaded, xhr.total );
		},
		err => {
            console.error( err.message );
        } );
    }
    
	load(){
        this.loadEnvironment();
		this.npcHandler = new NPCHandler(this);
		this.user = new User(this, new THREE.Vector3( -5.97, 0.021, -1.49), 1.57);
		this.ui = new UI(this);
    }

    loadEnvironment(){
    	const loader = new GLTFLoader( ).setPath(`${this.assetsPath}factory/`);
        
        this.loadingBar.visible = true;
		
		// Load a glTF resource
		loader.load(
			// resource URL
			'factory2.glb',
			// called when the resource is loaded
			gltf => {

				this.scene.add( gltf.scene );
                this.factory = gltf.scene;
				this.fans = [];

				const mergeObjects = {elements2:[], elements5:[], terrain:[]};

				gltf.scene.traverse( child => {
					if (child.isMesh){
						if (child.name == 'NavMesh'){
							this.navmesh = child;
							this.navmesh.geometry.rotateX( Math.PI/2 );
							this.navmesh.quaternion.identity();
							this.navmesh.position.set(0,0,0);
							child.material.visible = false;
						}else if (child.name.includes('fan')){
							this.fans.push( child );
						}else if (child.material.name.includes('elements2')){
							mergeObjects.elements2.push(child);
							child.castShadow = true;
						}else if (child.material.name.includes('elements5')){
							mergeObjects.elements5.push(child);
							child.castShadow = true;
						}else if (child.material.name.includes('terrain')){
							mergeObjects.terrain.push(child);
							child.castShadow = true;
						}else if (child.material.name.includes('sand')){
							child.receiveShadow = true;
						}else if ( child.material.name.includes('elements1')){
							child.castShadow = true;
							child.receiveShadow = true;
						}else if (child.parent.name.includes('main')){
							child.castShadow = true;
						}
					}
				});

				this.scene.add(this.navmesh);

				for(let prop in mergeObjects){
					const array = mergeObjects[prop];
					let material;
					array.forEach( object => {
						if (material == undefined){
							material = object.material;
						}else{
							object.material = material;
						}
					});
				}

				this.initPathfinding(this.navmesh);

				this.loadingBar.visible = !this.loadingBar.loaded;
			},
			// called while loading is progressing
			xhr => {

				this.loadingBar.update('environment', xhr.loaded, xhr.total);
				
			},
			// called when loading has errors
			err => {

				console.error( err );

			}
		);
	}			
    
	initSounds(){
		this.listener = new THREE.AudioListener();
        this.camera.add( this.listener );
		this.sfx = new SFX(this.camera, `${this.assetsPath}factory/sfx/`, this.listener);
		this.sfx.load('atmos', true, 0.1);
		this.user.initSounds();
		this.npcHandler.npcs.forEach( npc => npc.initSounds() );
	}
	
	startRendering(){
		if (this.npcHandler.ready && this.user.ready && this.bulletHandler == undefined){
			this.controller = new Controller(this);
			this.bulletHandler = new BulletHandler(this);
			this.renderer.setAnimationLoop( this.render.bind(this) );
			this.ui.visible = true;
			this.initSounds();
		}
	}

	render() {
		const dt = this.clock.getDelta();

		if (this.fans !== undefined){
            this.fans.forEach(fan => {
                fan.rotateY(dt); 
            });
        }

		if (this.npcHandler !== undefined ) this.npcHandler.update(dt);
		if (this.user !== undefined ) this.user.update(dt);
		if (this.controller !== undefined) this.controller.update(dt);
		if (this.bulletHandler !== undefined) this.bulletHandler.update(dt);
		if (this.tween !== undefined) this.tween.update(dt);

		if(this.active){
			this.checkCollisions();
		}

		if (this.composer){
			this.composer.render();
		}else{
        	this.renderer.render( this.scene, this.camera );
		}
	}
	// addStars(){
	// 	const star = new Star();
	// 	star.position.set(-5, 1, -27);
	// 	this.scene.add(star);	
	// 	this.stars.push(star);
    // }

	addStars() {
        // Predefined positions for 10 stars
        const positions = [
            new THREE.Vector3(1.5, 1.2, -3.46),
            new THREE.Vector3(-5, 1.2, 5),
            new THREE.Vector3(17, 1, -2),
            new THREE.Vector3(5, 1, -29),
            new THREE.Vector3(-22, 1, 5),
            new THREE.Vector3(-22.5, 1, -29.5),
            new THREE.Vector3(-5, 1, -27),
            new THREE.Vector3(25, 1, -25),
            new THREE.Vector3(-26, 1, -13),
            new THREE.Vector3(22, 1, -10.5)
        ];

		// Randomly select 5 unique indices from the positions array
        const selectedIndices = this.getRandomIndices(5, positions.length);

        // Add stars at the selected positions
        selectedIndices.forEach(index => {
            const star = new Star();
            star.position.copy(positions[index]); // Use the predefined position
            this.scene.add(star);
				this.stars.push(star);
        });
    }

    // Function to get random unique indices
    getRandomIndices(count, max) {
        const indices = [];
        while (indices.length < count) {
            const randIndex = Math.floor(Math.random() * max);
            if (!indices.includes(randIndex)) {
                indices.push(randIndex);
            }
        }
        return indices;
    }

	checkCollisions() {
        const playerPosition = this.user.position;
        for (let i = this.stars.length - 1; i >= 0; i--) {
            const star = this.stars[i];
            if (playerPosition.distanceTo(star.position) < 1) { // Adjust collision distance as needed
                this.scene.remove(star);
                this.stars.splice(i, 1);
                this.incrementTreasureCount();
            }
        }
    }

	incrementTreasureCount() {
        this.treasureCount++;
        document.querySelector('.treasure_count h2').textContent = `Star Count : ${this.treasureCount}`;
		if(this.treasureCount === 5){
			this.youwon();
		}
    }

	youwon(){
		this.active = false;
		this.ui.showYouWon();
		this.sfx.stop('atmos');
	}
}

export { Game };