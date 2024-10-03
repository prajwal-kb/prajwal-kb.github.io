import * as THREE from '../../libs/three137/three.module.js';

class Star extends THREE.Object3D {
    constructor() {
        super();
        this.createStarShape();
        this.scale.set(0.1,0.1,0.1);
    }

    createStarShape() {
        // Create the star shape
        const shape = new THREE.Shape();
        const outerRadius = 2;
        const innerRadius = 1;
        const numPoints = 5;

        for (let i = 0; i < 2 * numPoints; i++) {
            const angle = (i / numPoints) * Math.PI;
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (i === 0) {
                shape.moveTo(x, y);
            } else {
                shape.lineTo(x, y);
            }
        }
        shape.closePath();

        // Create the geometry and mesh with extrusion
        const extrudeSettings = { depth: 1, bevelEnabled: true, bevelSegments: 2, steps: 2, bevelSize: 0.5, bevelThickness: 0.5 };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = new THREE.MeshPhongMaterial({ color: 0xffff00, flatShading: true });
        const starMesh = new THREE.Mesh(geometry, material);

        // Add the star mesh to this object
        this.add(starMesh);
    }
}

export { Star };
