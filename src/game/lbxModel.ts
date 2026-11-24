import * as THREE from 'three';
import { getPaintById, getPartById, getWeaponById } from './catalog';
import { LegKinematicsInfo } from './footLocomotion';
import {
  createArmorDetailTexture,
  createCarbonFrameTexture,
  createContactShadowTexture,
} from './textures';
import { LbxLoadout, ModelStyle, WeaponKind } from './types';

export interface LbxRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  pelvis: THREE.Group;
  torsoPivot: THREE.Group;
  headPivot: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftAnkle?: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightAnkle?: THREE.Group;
  boosterPivot: THREE.Group;
  weaponPivot: THREE.Group;
  shieldPivot: THREE.Group;
  muzzlePoint: THREE.Object3D;
  bladeTipPoint: THREE.Object3D;
  bladeBasePoint?: THREE.Object3D;
  legKinematics?: LegKinematicsInfo;
  thrusterFlames: THREE.Mesh[];
  shadowDisc: THREE.Mesh;
  guardBubble: THREE.Mesh;
  hitFlashMaterials: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

function makeBevelPlate(
  w: number,
  h: number,
  depth: number,
  taperTop = 0.85,
  bevel = 0.03,
): THREE.ExtrudeGeometry {
  const hw = w / 2;
  const tw = (w * taperTop) / 2;
  const hh = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(tw, hh);
  shape.lineTo(-tw, hh);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function makeHexChest(w: number, h: number, depth: number): THREE.ExtrudeGeometry {
  const hw = w / 2;
  const hh = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, -hh * 1.15);
  shape.lineTo(hw * 0.85, -hh * 0.45);
  shape.lineTo(hw, hh * 0.55);
  shape.lineTo(hw * 0.48, hh);
  shape.lineTo(-hw * 0.48, hh);
  shape.lineTo(-hw, hh * 0.55);
  shape.lineTo(-hw * 0.85, -hh * 0.45);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.035,
    bevelSize: 0.035,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

function makeWingShape(length: number, width: number, depth = 0.035): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, width * 0.4);
  shape.lineTo(length * 0.85, -width * 0.55);
  shape.lineTo(length * 0.25, -width * 0.35);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
  return geo;
}

export interface HangarWeaponGroups {
  weaponGroup: THREE.Group;
  shieldGroup: THREE.Group;
  muzzlePoint: THREE.Object3D;
  bladeTipPoint: THREE.Object3D;
  bladeBasePoint?: THREE.Object3D;
  dispose: () => void;
}

function populateWeaponAndShield(
  kind: WeaponKind,
  weaponPivot: THREE.Group,
  shieldPivot: THREE.Group,
  muzzlePoint: THREE.Object3D,
  bladeTipPoint: THREE.Object3D,
  mats: {
    primaryMat: THREE.Material;
    secondaryMat: THREE.Material;
    accentMat: THREE.Material;
    gunmetalMat: THREE.Material;
    frameMat: THREE.Material;
    weaponEnergyMat: THREE.Material;
  },
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
  bladeBasePoint?: THREE.Object3D,
) {
  const {
    primaryMat,
    secondaryMat,
    accentMat,
    gunmetalMat,
    frameMat,
    weaponEnergyMat,
  } = mats;

  if (kind === 'lance') {
    const guardCone = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.15, 0.3, 8)),
      accentMat,
    );
    guardCone.rotation.x = Math.PI / 2;
    guardCone.position.z = 0.22;
    weaponPivot.add(guardCone);

    const lanceTip = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.13, 1.38, 6)),
      secondaryMat,
    );
    lanceTip.rotation.x = Math.PI / 2;
    lanceTip.position.z = 0.98;
    lanceTip.castShadow = true;
    weaponPivot.add(lanceTip);

    const lanceTrim = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.058, 1.18, 6)),
      weaponEnergyMat,
    );
    lanceTrim.rotation.x = Math.PI / 2;
    lanceTrim.position.z = 1.06;
    weaponPivot.add(lanceTrim);

    bladeTipPoint.position.set(0, 0, 1.55);
    weaponPivot.add(bladeTipPoint);
    if (bladeBasePoint) {
      bladeBasePoint.position.set(0, 0, 0.34);
      weaponPivot.add(bladeBasePoint);
    }

    const shieldBody = new THREE.Mesh(
      trackGeo(makeHexChest(0.5, 0.82, 0.07)),
      primaryMat,
    );
    shieldBody.position.set(-0.08, 0, 0.06);
    shieldBody.rotation.y = -Math.PI / 2;
    shieldBody.castShadow = true;
    shieldPivot.add(shieldBody);

    const shieldTrim = new THREE.Mesh(
      trackGeo(makeHexChest(0.34, 0.54, 0.09)),
      accentMat,
    );
    shieldTrim.position.set(-0.09, 0, 0.06);
    shieldTrim.rotation.y = -Math.PI / 2;
    shieldPivot.add(shieldTrim);
  } else if (kind === 'kodachi') {
    const buildDagger = (parent: THREE.Group, isRight: boolean) => {
      const hilt = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.24, 8)),
        frameMat,
      );
      hilt.rotation.x = Math.PI / 2;
      parent.add(hilt);

      const crossguard = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.14, 0.04, 0.04)),
        accentMat,
      );
      crossguard.position.z = 0.1;
      parent.add(crossguard);

      const blade = new THREE.Mesh(
        trackGeo(makeWingShape(0.84, 0.11, 0.022)),
        weaponEnergyMat,
      );
      blade.rotation.y = -Math.PI / 2;
      blade.position.set(0, 0.02, 0.1);
      parent.add(blade);
      if (isRight) {
        bladeTipPoint.position.set(0, 0, 0.9);
        parent.add(bladeTipPoint);
      }
    };
    buildDagger(weaponPivot, true);
    const offHandPivot = new THREE.Group();
    offHandPivot.position.set(0, -0.14, 0.02);
    shieldPivot.add(offHandPivot);
    buildDagger(offHandPivot, false);
  } else if (kind === 'hammer') {
    const shaft = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.046, 0.046, 2.14, 10)),
      frameMat,
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.25;
    weaponPivot.add(shaft);

    const pommelSpike = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.085, 0.14, 6)),
      accentMat,
    );
    pommelSpike.rotation.x = -Math.PI / 2;
    pommelSpike.position.z = -0.84;
    weaponPivot.add(pommelSpike);

    const hammerHead = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.3, 0.3, 0.76, 8)),
      primaryMat,
    );
    hammerHead.rotation.z = Math.PI / 2;
    hammerHead.position.z = 1.24;
    hammerHead.castShadow = true;
    weaponPivot.add(hammerHead);

    [-1, 1].forEach((s) => {
      const cap = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.32, 0.25, 0.12, 8)),
        accentMat,
      );
      cap.rotation.z = Math.PI / 2;
      cap.position.set(s * 0.42, 0, 1.24);
      weaponPivot.add(cap);
    });

    const coreBand = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.3, 0.038, 8, 16)),
      weaponEnergyMat,
    );
    coreBand.rotation.y = Math.PI / 2;
    coreBand.position.z = 1.24;
    weaponPivot.add(coreBand);

    bladeTipPoint.position.set(0, 0, 1.42);
    weaponPivot.add(bladeTipPoint);
  } else if (kind === 'rifle') {
    const rifleAssembly = new THREE.Group();
    rifleAssembly.rotation.x = Math.PI / 2;
    rifleAssembly.position.set(0, -0.02, -0.03);
    weaponPivot.add(rifleAssembly);

    const grip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.06, 0.18, 0.075)),
      gunmetalMat,
    );
    grip.position.set(0, -0.04, -0.02);
    grip.rotation.x = 0.24;
    rifleAssembly.add(grip);

    const stockFrame = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.075, 0.14, 0.42, 0.85, 0.01)),
      primaryMat,
    );
    stockFrame.position.set(0, 0.05, -0.24);
    stockFrame.castShadow = true;
    rifleAssembly.add(stockFrame);

    const buttPad = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.085, 0.19, 0.05)),
      frameMat,
    );
    buttPad.position.set(0, 0.03, -0.46);
    rifleAssembly.add(buttPad);

    const cheekRiser = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 0.04, 0.2)),
      accentMat,
    );
    cheekRiser.position.set(0, 0.135, -0.24);
    rifleAssembly.add(cheekRiser);

    const lowerReceiver = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.095, 0.12, 0.46, 0.9, 0.012)),
      gunmetalMat,
    );
    lowerReceiver.position.set(0, 0.04, 0.16);
    rifleAssembly.add(lowerReceiver);

    const upperReceiver = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.11, 0.11, 0.52, 0.82, 0.014)),
      primaryMat,
    );
    upperReceiver.position.set(0, 0.12, 0.2);
    upperReceiver.castShadow = true;
    rifleAssembly.add(upperReceiver);

    const magazine = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.055, 0.2, 0.11)),
      accentMat,
    );
    magazine.position.set(0, -0.09, 0.22);
    magazine.rotation.x = 0.18;
    rifleAssembly.add(magazine);

    const rail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.055, 0.03, 0.56)),
      gunmetalMat,
    );
    rail.position.set(0, 0.19, 0.24);
    rifleAssembly.add(rail);

    const scopeTube = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.038, 0.036, 0.34, 12)),
      gunmetalMat,
    );
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.255, 0.24);
    rifleAssembly.add(scopeTube);

    const scopeBellFront = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.054, 0.038, 0.1, 12)),
      accentMat,
    );
    scopeBellFront.rotation.x = Math.PI / 2;
    scopeBellFront.position.set(0, 0.255, 0.43);
    rifleAssembly.add(scopeBellFront);

    const scopeLens = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.044, 0.044, 0.02, 12)),
      weaponEnergyMat,
    );
    scopeLens.rotation.x = Math.PI / 2;
    scopeLens.position.set(0, 0.255, 0.485);
    rifleAssembly.add(scopeLens);

    const shroud = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.095, 0.1, 0.42, 0.85, 0.01)),
      secondaryMat,
    );
    shroud.position.set(0, 0.11, 0.65);
    shroud.castShadow = true;
    rifleAssembly.add(shroud);

    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.014, 0.012, 0.22, 6)),
        gunmetalMat,
      );
      leg.position.set(side * 0.06, 0.01, 0.72);
      leg.rotation.x = Math.PI / 2 - 0.35;
      leg.rotation.z = side * 0.18;
      rifleAssembly.add(leg);
    });

    const barrel = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.026, 0.032, 0.72, 12)),
      gunmetalMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.11, 1.06);
    barrel.castShadow = true;
    rifleAssembly.add(barrel);

    const energyStrip = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.035, 0.02, 0.56)),
      weaponEnergyMat,
    );
    energyStrip.position.set(0, 0.145, 0.85);
    rifleAssembly.add(energyStrip);

    const muzzleBrake = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.075, 0.075, 0.16)),
      accentMat,
    );
    muzzleBrake.position.set(0, 0.11, 1.44);
    rifleAssembly.add(muzzleBrake);

    muzzlePoint.position.set(0, 0.11, 1.54);
    rifleAssembly.add(muzzlePoint);
    bladeTipPoint.position.set(0, 0.11, 1.54);
    rifleAssembly.add(bladeTipPoint);
  } else {
    const pole = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 1.48, 10)),
      secondaryMat,
    );
    pole.rotation.x = Math.PI / 2;
    pole.position.z = 0.48;
    weaponPivot.add(pole);

    const emitter = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.15, 0.19, 0.25, 0.7, 0.015)),
      accentMat,
    );
    emitter.position.z = 1.05;
    weaponPivot.add(emitter);

    const beamBlade = new THREE.Mesh(
      trackGeo(makeWingShape(0.98, 0.25, 0.024)),
      weaponEnergyMat,
    );
    beamBlade.rotation.y = -Math.PI / 2;
    beamBlade.position.set(0, 0.04, 1.05);
    weaponPivot.add(beamBlade);

    bladeTipPoint.position.set(0, 0, 1.85);
    weaponPivot.add(bladeTipPoint);
  }
}

export function buildHangarWeaponGroups(loadout: LbxLoadout): HangarWeaponGroups {
  const paint = getPaintById(loadout.paintId);
  const weapon = getWeaponById(loadout.weaponId);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const carbonTex = createCarbonFrameTexture();
  const primaryTex = createArmorDetailTexture(paint.primary);
  const secondaryTex = createArmorDetailTexture(paint.secondary);
  textures.push(carbonTex, primaryTex, secondaryTex);

  const primaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: primaryTex,
      metalness: 0.55,
      roughness: 0.24,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
    }),
  );
  const secondaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: secondaryTex,
      metalness: 0.42,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    }),
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: paint.accent,
      metalness: 0.88,
      roughness: 0.18,
    }),
  );
  const gunmetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.78,
      roughness: 0.32,
    }),
  );
  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: paint.frame,
      map: carbonTex,
      metalness: 0.35,
      roughness: 0.68,
    }),
  );
  const weaponEnergyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: weapon.accentHex,
      emissive: weapon.accentHex,
      emissiveIntensity: 2.3,
      roughness: 0.15,
      metalness: 0.2,
    }),
  );

  const weaponGroup = new THREE.Group();
  const shieldGroup = new THREE.Group();
  const muzzlePoint = new THREE.Object3D();
  const bladeTipPoint = new THREE.Object3D();
  const bladeBasePoint = new THREE.Object3D();

  populateWeaponAndShield(
    weapon.kind,
    weaponGroup,
    shieldGroup,
    muzzlePoint,
    bladeTipPoint,
    {
      primaryMat,
      secondaryMat,
      accentMat,
      gunmetalMat,
      frameMat,
      weaponEnergyMat,
    },
    trackGeo,
    bladeBasePoint,
  );

  return {
    weaponGroup,
    shieldGroup,
    muzzlePoint,
    bladeTipPoint,
    bladeBasePoint,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}

export function buildLbxModel(loadout: LbxLoadout): LbxRig {
  const paint = getPaintById(loadout.paintId);
  const headStyle = getPartById(loadout.headId).style;
  const torsoStyle = getPartById(loadout.torsoId).style;
  const armsStyle = getPartById(loadout.armsId).style;
  const legsStyle = getPartById(loadout.legsId).style;
  const boosterStyle = getPartById(loadout.boosterId).style;
  const weapon = getWeaponById(loadout.weaponId);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const hitFlashMaterials: THREE.MeshStandardMaterial[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const carbonTex = createCarbonFrameTexture();
  const primaryTex = createArmorDetailTexture(paint.primary);
  const secondaryTex = createArmorDetailTexture(paint.secondary);
  textures.push(carbonTex, primaryTex, secondaryTex);

  // Calibrated PBR materials with panel-line micro-detail and >= 0.25 roughness contrast
  const primaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: primaryTex,
      metalness: 0.55,
      roughness: 0.24,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
    }),
  );
  hitFlashMaterials.push(primaryMat);

  const secondaryMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: secondaryTex,
      metalness: 0.42,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    }),
  );
  hitFlashMaterials.push(secondaryMat);

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: paint.accent,
      metalness: 0.88,
      roughness: 0.18,
    }),
  );
  hitFlashMaterials.push(accentMat);

  const gunmetalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.78,
      roughness: 0.32,
    }),
  );

  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: paint.frame,
      map: carbonTex,
      metalness: 0.35,
      roughness: 0.68,
    }),
  );

  const visorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: paint.visor,
      emissive: paint.visor,
      emissiveIntensity: 2.2,
      roughness: 0.1,
      metalness: 0.1,
    }),
  );

  const weaponEnergyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: weapon.accentHex,
      emissive: weapon.accentHex,
      emissiveIntensity: 2.3,
      roughness: 0.15,
      metalness: 0.2,
    }),
  );

  const thrusterMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: weapon.accentHex,
      transparent: true,
      opacity: 0.85,
    }),
  );

  const root = new THREE.Group();

  // Contact shadow disc grounded at y = 0.015
  const shadowTex = createContactShadowTexture();
  textures.push(shadowTex);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    }),
  );
  const shadowDisc = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(1.85, 1.85)),
    shadowMat,
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.015;
  root.add(shadowDisc);

  // Guard energy dome
  const guardMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: weapon.accentHex,
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      depthWrite: false,
    }),
  );
  const guardBubble = new THREE.Mesh(
    trackGeo(new THREE.IcosahedronGeometry(1.22, 1)),
    guardMat,
  );
  guardBubble.position.y = 1.05;
  guardBubble.visible = false;
  root.add(guardBubble);

  // Body container
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // PELVIS (y = 0.86 so feet touch y = 0)
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.86;
  bodyGroup.add(pelvis);

  const pelvisCore = new THREE.Mesh(
    trackGeo(makeBevelPlate(0.48, 0.22, 0.36, 0.78, 0.025)),
    secondaryMat,
  );
  pelvisCore.castShadow = true;
  pelvis.add(pelvisCore);

  // Central belt buckle sensor + rear stabilizer
  const beltBuckle = new THREE.Mesh(
    trackGeo(makeBevelPlate(0.16, 0.12, 0.1, 0.8, 0.01)),
    accentMat,
  );
  beltBuckle.position.set(0, 0.04, 0.21);
  pelvis.add(beltBuckle);

  const frontSkirt = new THREE.Mesh(
    trackGeo(makeBevelPlate(0.32, 0.24, 0.08, 0.72, 0.015)),
    primaryMat,
  );
  frontSkirt.position.set(0, -0.07, 0.2);
  frontSkirt.rotation.x = -0.18;
  frontSkirt.castShadow = true;
  pelvis.add(frontSkirt);

  const rearSkirt = new THREE.Mesh(
    trackGeo(makeBevelPlate(0.38, 0.24, 0.09, 0.85, 0.015)),
    primaryMat,
  );
  rearSkirt.position.set(0, -0.06, -0.2);
  rearSkirt.rotation.x = 0.22;
  pelvis.add(rearSkirt);

  // Side hip armor skirts + mini vernier nozzles
  [-1, 1].forEach((side) => {
    const hipBall = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.095, 10, 10)),
      frameMat,
    );
    hipBall.position.set(side * 0.19, -0.05, 0);
    pelvis.add(hipBall);

    const skirt = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.19, 0.28, 0.26, 0.8, 0.015)),
      primaryMat,
    );
    skirt.position.set(side * 0.28, -0.05, 0);
    skirt.rotation.z = side * 0.24;
    skirt.castShadow = true;
    pelvis.add(skirt);

    const skirtTrim = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.05, 0.22, 0.2, 0.85, 0.008)),
      accentMat,
    );
    skirtTrim.position.set(side * 0.35, -0.04, 0);
    skirtTrim.rotation.z = side * 0.24;
    pelvis.add(skirtTrim);
  });

  // TORSO
  const torsoPivot = new THREE.Group();
  torsoPivot.position.y = 0.14;
  pelvis.add(torsoPivot);

  const waistCol = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.17, 0.15, 0.22, 12)),
    frameMat,
  );
  waistCol.position.y = 0.09;
  torsoPivot.add(waistCol);

  // Twin hydraulic waist pistons
  [-1, 1].forEach((side) => {
    const piston = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 8)),
      accentMat,
    );
    piston.position.set(side * 0.14, 0.09, 0.08);
    piston.rotation.z = side * 0.12;
    torsoPivot.add(piston);
  });

  const buildTorso = (style: ModelStyle) => {
    const chestGroup = new THREE.Group();
    chestGroup.position.y = 0.35;
    torsoPivot.add(chestGroup);

    const chestArmor = new THREE.Mesh(
      trackGeo(
        style === 'emperor'
          ? makeHexChest(0.78, 0.58, 0.46)
          : style === 'kunoichi'
            ? makeHexChest(0.58, 0.49, 0.36)
            : makeHexChest(0.68, 0.54, 0.4),
      ),
      primaryMat,
    );
    chestArmor.castShadow = true;
    chestArmor.receiveShadow = true;
    chestGroup.add(chestArmor);

    // Layered sternum + clavicle vents
    const sternum = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.32, 0.4, 0.16, 0.72, 0.02)),
      secondaryMat,
    );
    sternum.position.set(0, 0.02, 0.19);
    sternum.castShadow = true;
    chestGroup.add(sternum);

    [-1, 1].forEach((side) => {
      // Ribbed chest intake grilles
      const vent = new THREE.Mesh(
        trackGeo(makeBevelPlate(0.16, 0.11, 0.08, 0.85, 0.01)),
        gunmetalMat,
      );
      vent.position.set(side * 0.21, 0.07, 0.21);
      vent.rotation.y = side * 0.22;
      chestGroup.add(vent);

      const ventSlit = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.11, 0.025, 0.09)),
        visorMat,
      );
      ventSlit.position.set(side * 0.21, 0.07, 0.22);
      ventSlit.rotation.y = side * 0.22;
      chestGroup.add(ventSlit);

      // Clavicle shoulder armor plates
      const clav = new THREE.Mesh(
        trackGeo(makeBevelPlate(0.16, 0.08, 0.22, 0.8, 0.01)),
        accentMat,
      );
      clav.position.set(side * 0.22, 0.25, 0.02);
      clav.rotation.z = -side * 0.18;
      chestGroup.add(clav);
    });

    // Dorsal spine armor segments
    for (let s = 0; s < 3; s++) {
      const spine = new THREE.Mesh(
        trackGeo(makeBevelPlate(0.16, 0.1, 0.1, 0.75, 0.01)),
        secondaryMat,
      );
      spine.position.set(0, -0.14 + s * 0.12, -0.22);
      chestGroup.add(spine);
    }

    // Reactor core window with multi-ring bezel
    const reactorBezel = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.115, 0.115, 0.09, 16)),
      accentMat,
    );
    reactorBezel.rotation.x = Math.PI / 2;
    reactorBezel.position.set(0, 0.04, 0.25);
    chestGroup.add(reactorBezel);

    const reactorInnerRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.085, 0.018, 8, 16)),
      gunmetalMat,
    );
    reactorInnerRing.position.set(0, 0.04, 0.295);
    chestGroup.add(reactorInnerRing);

    const reactorOrb = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.078, 14, 14)),
      visorMat,
    );
    reactorOrb.position.set(0, 0.04, 0.28);
    chestGroup.add(reactorOrb);

    if (style === 'emperor') {
      [-1, 1].forEach((side) => {
        const collar = new THREE.Mesh(
          trackGeo(makeBevelPlate(0.15, 0.24, 0.28, 0.65, 0.02)),
          accentMat,
        );
        collar.position.set(side * 0.26, 0.25, 0.04);
        collar.rotation.z = -side * 0.28;
        chestGroup.add(collar);
      });
    } else if (style === 'odin') {
      [-1, 1].forEach((side) => {
        const intake = new THREE.Mesh(
          trackGeo(makeBevelPlate(0.18, 0.16, 0.14, 0.85, 0.015)),
          accentMat,
        );
        intake.position.set(side * 0.23, 0.09, 0.2);
        intake.rotation.y = side * 0.24;
        chestGroup.add(intake);
      });
    } else if (style === 'hunter') {
      [-1, 1].forEach((side) => {
        const pack = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.058, 0.058, 0.28, 10)),
          accentMat,
        );
        pack.position.set(side * 0.28, -0.02, 0.15);
        chestGroup.add(pack);
      });
    }
  };
  buildTorso(torsoStyle);

  // HEAD
  const headPivot = new THREE.Group();
  headPivot.position.y = 0.68;
  torsoPivot.add(headPivot);

  const neck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.09, 0.105, 0.13, 10)),
    frameMat,
  );
  neck.position.y = 0.04;
  headPivot.add(neck);

  const buildHead = (style: ModelStyle) => {
    const hGroup = new THREE.Group();
    hGroup.position.y = 0.23;
    headPivot.add(hGroup);

    const cranium = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.34, 0.29, 0.35, 0.82, 0.035)),
      primaryMat,
    );
    cranium.castShadow = true;
    hGroup.add(cranium);

    // Cheek guards & ear comms pods
    [-1, 1].forEach((side) => {
      const cheek = new THREE.Mesh(
        trackGeo(makeBevelPlate(0.08, 0.18, 0.22, 0.7, 0.012)),
        secondaryMat,
      );
      cheek.position.set(side * 0.15, -0.04, 0.1);
      cheek.rotation.y = side * 0.2;
      hGroup.add(cheek);

      const earPod = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 12)),
        accentMat,
      );
      earPod.rotation.z = Math.PI / 2;
      earPod.position.set(side * 0.19, 0.02, -0.01);
      hGroup.add(earPod);
    });

    // Faceplate & chin guard
    const face = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.22, 0.2, 0.11, 0.78, 0.015)),
      secondaryMat,
    );
    face.position.set(0, -0.03, 0.16);
    hGroup.add(face);

    const chinGuard = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.11, 0.08, 0.08, 0.7, 0.01)),
      accentMat,
    );
    chinGuard.position.set(0, -0.1, 0.19);
    hGroup.add(chinGuard);

    // Dual eye / visor glow + forehead sensor lens
    const visorFrame = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.25, 0.095, 0.05, 0.9, 0.008)),
      gunmetalMat,
    );
    visorFrame.position.set(0, 0.025, 0.185);
    hGroup.add(visorFrame);

    const visor = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.22, 0.068, 0.06, 0.92, 0.008)),
      visorMat,
    );
    visor.position.set(0, 0.025, 0.195);
    hGroup.add(visor);

    const browJewel = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.06, 0.055, 0.06)),
      visorMat,
    );
    browJewel.position.set(0, 0.11, 0.18);
    hGroup.add(browJewel);

    if (style === 'achilles') {
      const crest = new THREE.Mesh(
        trackGeo(makeBevelPlate(0.085, 0.23, 0.39, 0.6, 0.015)),
        accentMat,
      );
      crest.position.set(0, 0.18, -0.02);
      hGroup.add(crest);

      [-1, 1].forEach((side) => {
        const vFin = new THREE.Mesh(
          trackGeo(makeWingShape(0.22, 0.065, 0.018)),
          accentMat,
        );
        vFin.position.set(side * 0.03, 0.11, 0.19);
        vFin.rotation.z = side > 0 ? 0.52 : Math.PI - 0.52;
        hGroup.add(vFin);
      });

      const plume = new THREE.Mesh(
        trackGeo(makeWingShape(0.38, 0.15, 0.03)),
        trackMat(
          new THREE.MeshStandardMaterial({
            color: '#DC2626',
            roughness: 0.42,
            metalness: 0.18,
          }),
        ),
      );
      plume.rotation.y = Math.PI / 2;
      plume.rotation.z = 0.25;
      plume.position.set(0.015, 0.24, -0.06);
      hGroup.add(plume);
    } else if (style === 'kunoichi') {
      [-1, 1].forEach((side) => {
        const ant = new THREE.Mesh(
          trackGeo(makeWingShape(0.34, 0.095, 0.02)),
          accentMat,
        );
        ant.position.set(side * 0.16, 0.06, 0);
        ant.rotation.y = side > 0 ? -Math.PI * 0.65 : Math.PI * 1.65;
        ant.rotation.z = 0.45;
        hGroup.add(ant);
      });
    } else if (style === 'emperor') {
      [-1, 1].forEach((side) => {
        const horn = new THREE.Mesh(
          trackGeo(new THREE.ConeGeometry(0.058, 0.38, 8)),
          accentMat,
        );
        horn.position.set(side * 0.16, 0.21, 0.08);
        horn.rotation.z = -side * 0.55;
        horn.rotation.x = 0.25;
        hGroup.add(horn);
      });
    } else if (style === 'hunter') {
      const opticPod = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 12)),
        accentMat,
      );
      opticPod.rotation.x = Math.PI / 2;
      opticPod.position.set(0.14, 0.08, 0.14);
      hGroup.add(opticPod);

      const lens = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12)),
        visorMat,
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(0.14, 0.08, 0.24);
      hGroup.add(lens);

      const antenna = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.012, 0.018, 0.36, 6)),
        secondaryMat,
      );
      antenna.position.set(-0.17, 0.24, -0.08);
      hGroup.add(antenna);
    } else if (style === 'odin') {
      [-1, 1].forEach((side) => {
        const fin = new THREE.Mesh(
          trackGeo(makeWingShape(0.35, 0.11, 0.02)),
          accentMat,
        );
        fin.position.set(side * 0.04, 0.12, 0.18);
        fin.rotation.z = side > 0 ? 0.52 : Math.PI - 0.52;
        fin.rotation.y = side * 0.2;
        hGroup.add(fin);
      });
    }
  };
  buildHead(headStyle);

  // BOOSTER / BACKPACK
  const boosterPivot = new THREE.Group();
  boosterPivot.position.set(0, 0.42, -0.23);
  torsoPivot.add(boosterPivot);

  const thrusterFlames: THREE.Mesh[] = [];

  const buildBooster = (style: ModelStyle) => {
    const pack = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.4, 0.36, 0.18, 0.85, 0.02)),
      frameMat,
    );
    pack.castShadow = true;
    boosterPivot.add(pack);

    const coreVent = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 12)),
      visorMat,
    );
    coreVent.rotation.x = Math.PI / 2;
    coreVent.position.set(0, 0.05, -0.08);
    boosterPivot.add(coreVent);

    const nozzleOffsets = style === 'odin' ? [-0.24, 0.24] : [-0.13, 0.13];
    nozzleOffsets.forEach((nx) => {
      const nozzle = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.058, 0.082, 0.14, 10)),
        accentMat,
      );
      nozzle.rotation.x = 0.45;
      nozzle.position.set(nx, -0.09, -0.11);
      boosterPivot.add(nozzle);

      const flame = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.058, 0.38, 8)),
        thrusterMat,
      );
      flame.rotation.x = -Math.PI / 2 + 0.45;
      flame.position.set(nx, -0.17, -0.3);
      flame.scale.set(1, 0.2, 1);
      boosterPivot.add(flame);
      thrusterFlames.push(flame);
    });

    if (style === 'achilles') {
      const cape = new THREE.Mesh(
        trackGeo(makeBevelPlate(0.58, 0.74, 0.025, 0.62, 0.01)),
        trackMat(
          new THREE.MeshStandardMaterial({
            color: '#B91C1C',
            roughness: 0.75,
            metalness: 0.1,
          }),
        ),
      );
      cape.position.set(0, -0.34, -0.09);
      cape.rotation.x = 0.18;
      cape.castShadow = true;
      boosterPivot.add(cape);
    } else if (style === 'kunoichi') {
      [-1, 1].forEach((side) => {
        const scarf = new THREE.Mesh(
          trackGeo(makeWingShape(0.58, 0.13, 0.02)),
          accentMat,
        );
        scarf.position.set(side * 0.08, 0.12, -0.08);
        scarf.rotation.y = side > 0 ? Math.PI * 0.58 : Math.PI * 0.42;
        scarf.rotation.z = -0.35;
        boosterPivot.add(scarf);
      });
    } else if (style === 'emperor' || style === 'odin') {
      const wingLen = style === 'odin' ? 0.9 : 0.65;
      [-1, 1].forEach((side) => {
        const wing = new THREE.Mesh(
          trackGeo(makeWingShape(wingLen, 0.3, 0.028)),
          style === 'odin' ? secondaryMat : primaryMat,
        );
        wing.position.set(side * 0.14, 0.08, -0.06);
        wing.rotation.y = side > 0 ? -0.32 : Math.PI + 0.32;
        wing.rotation.z = 0.24;
        wing.castShadow = true;
        boosterPivot.add(wing);

        const wingTrim = new THREE.Mesh(
          trackGeo(makeWingShape(wingLen * 0.85, 0.1, 0.032)),
          accentMat,
        );
        wingTrim.position.set(side * 0.14, 0.12, -0.055);
        wingTrim.rotation.y = side > 0 ? -0.32 : Math.PI + 0.32;
        wingTrim.rotation.z = 0.26;
        boosterPivot.add(wingTrim);
      });
    }
  };
  buildBooster(boosterStyle);

  // ARMS (with shoulder rotator rings, bicep cuffs, elbow pistons, wrist shields)
  const shoulderX = torsoStyle === 'emperor' ? 0.37 : armsStyle === 'kunoichi' ? 0.34 : 0.37;
  const shoulderY = 0.46;
  const leftShoulder = new THREE.Group();
  leftShoulder.position.set(-shoulderX, shoulderY, 0);
  torsoPivot.add(leftShoulder);

  const rightShoulder = new THREE.Group();
  rightShoulder.position.set(shoulderX, shoulderY, 0);
  torsoPivot.add(rightShoulder);

  const leftElbow = new THREE.Group();
  const rightElbow = new THREE.Group();

  const buildArm = (
    shoulderGroup: THREE.Group,
    elbowGroup: THREE.Group,
    side: -1 | 1,
    style: ModelStyle,
  ) => {
    const shoulderJoint = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.1, 12, 12)),
      frameMat,
    );
    shoulderGroup.add(shoulderJoint);

    const pauldronGeo =
      style === 'emperor'
        ? makeBevelPlate(0.34, 0.3, 0.36, 0.65, 0.025)
        : style === 'odin'
          ? makeBevelPlate(0.36, 0.24, 0.3, 0.5, 0.02)
          : makeBevelPlate(0.26, 0.24, 0.28, 0.72, 0.02);

    const pauldron = new THREE.Mesh(trackGeo(pauldronGeo), primaryMat);
    pauldron.position.set(side * 0.06, 0.05, 0);
    pauldron.rotation.z = -side * 0.25;
    pauldron.castShadow = true;
    shoulderGroup.add(pauldron);

    const pauldronTrim = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.22, 0.08, 0.3, 0.78, 0.01)),
      accentMat,
    );
    pauldronTrim.position.set(side * 0.09, -0.05, 0);
    pauldronTrim.rotation.z = -side * 0.25;
    shoulderGroup.add(pauldronTrim);

    if (style === 'emperor') {
      const spike = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(0.052, 0.2, 6)),
        accentMat,
      );
      spike.position.set(side * 0.15, 0.16, 0);
      spike.rotation.z = -side * 0.6;
      shoulderGroup.add(spike);
    }

    const upperArm = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.078, 0.07, 0.26, 10)),
      frameMat,
    );
    upperArm.position.y = -0.14;
    upperArm.castShadow = true;
    shoulderGroup.add(upperArm);

    const bicepCuff = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.14, 0.14, 0.15, 0.85, 0.012)),
      secondaryMat,
    );
    bicepCuff.position.y = -0.14;
    shoulderGroup.add(bicepCuff);

    elbowGroup.position.set(0, -0.28, 0);
    shoulderGroup.add(elbowGroup);

    const elbowJoint = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.068, 0.068, 0.14, 12)),
      accentMat,
    );
    elbowJoint.rotation.z = Math.PI / 2;
    elbowGroup.add(elbowJoint);

    const forearm = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.165, 0.29, 0.175, 0.82, 0.015)),
      secondaryMat,
    );
    forearm.position.y = -0.16;
    forearm.castShadow = true;
    elbowGroup.add(forearm);

    const wristGuard = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.18, 0.1, 0.18, 0.85, 0.01)),
      primaryMat,
    );
    wristGuard.position.y = -0.26;
    elbowGroup.add(wristGuard);

    const fist = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.115, 0.115, 0.125)),
      gunmetalMat,
    );
    fist.position.y = -0.33;
    elbowGroup.add(fist);

    const knucklePlate = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.12, 0.06, 0.04)),
      accentMat,
    );
    knucklePlate.position.set(0, -0.34, 0.065);
    elbowGroup.add(knucklePlate);
  };

  buildArm(leftShoulder, leftElbow, -1, armsStyle);
  buildArm(rightShoulder, rightElbow, 1, armsStyle);

  // WEAPON & SHIELD ATTACHMENTS
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0, -0.34, 0.06);
  rightElbow.add(weaponPivot);

  const shieldPivot = new THREE.Group();
  shieldPivot.position.set(-0.08, -0.18, 0.08);
  leftElbow.add(shieldPivot);

  const muzzlePoint = new THREE.Object3D();
  const bladeTipPoint = new THREE.Object3D();
  const bladeBasePoint = new THREE.Object3D();

  populateWeaponAndShield(
    weapon.kind,
    weaponPivot,
    shieldPivot,
    muzzlePoint,
    bladeTipPoint,
    {
      primaryMat,
      secondaryMat,
      accentMat,
      gunmetalMat,
      frameMat,
      weaponEnergyMat,
    },
    trackGeo,
    bladeBasePoint,
  );

  // LEGS (with knee pistons, thigh thrusters, ankle cuffs, heel spurs)
  const leftHip = new THREE.Group();
  leftHip.position.set(-0.2, -0.06, 0);
  pelvis.add(leftHip);

  const rightHip = new THREE.Group();
  rightHip.position.set(0.2, -0.06, 0);
  pelvis.add(rightHip);

  const leftKnee = new THREE.Group();
  const rightKnee = new THREE.Group();
  const leftAnkle = new THREE.Group();
  const rightAnkle = new THREE.Group();

  const buildLeg = (
    hipGroup: THREE.Group,
    kneeGroup: THREE.Group,
    ankleGroup: THREE.Group,
    side: -1 | 1,
    style: ModelStyle,
  ) => {
    const thigh = new THREE.Mesh(
      trackGeo(
        makeBevelPlate(
          style === 'emperor' ? 0.23 : 0.18,
          0.34,
          0.23,
          0.88,
          0.02,
        ),
      ),
      secondaryMat,
    );
    thigh.position.y = -0.18;
    thigh.castShadow = true;
    hipGroup.add(thigh);

    // Side thigh thruster pod
    const thighPod = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.06, 0.2, 0.14, 0.8, 0.01)),
      accentMat,
    );
    thighPod.position.set(side * 0.12, -0.16, -0.02);
    hipGroup.add(thighPod);

    kneeGroup.position.set(0, -0.36, 0);
    hipGroup.add(kneeGroup);

    const kneeJoint = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10)),
      frameMat,
    );
    kneeJoint.rotation.z = Math.PI / 2;
    kneeGroup.add(kneeJoint);

    const kneeCap = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.15, 0.16, 0.13, 0.72, 0.015)),
      accentMat,
    );
    kneeCap.position.set(0, 0.02, 0.11);
    kneeGroup.add(kneeCap);

    const shin = new THREE.Mesh(
      trackGeo(
        makeBevelPlate(
          style === 'emperor' ? 0.26 : 0.2,
          0.38,
          0.25,
          0.76,
          0.02,
        ),
      ),
      primaryMat,
    );
    shin.position.y = -0.2;
    shin.castShadow = true;
    shin.receiveShadow = true;
    kneeGroup.add(shin);

    // Ankle armor cuff
    const ankleCuff = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.22, 0.09, 0.24, 0.85, 0.012)),
      secondaryMat,
    );
    ankleCuff.position.set(0, -0.34, 0.02);
    kneeGroup.add(ankleCuff);

    if (style === 'odin' || style === 'kunoichi') {
      const calfFin = new THREE.Mesh(
        trackGeo(makeWingShape(0.22, 0.085, 0.02)),
        accentMat,
      );
      calfFin.position.set(side * 0.11, -0.14, -0.08);
      calfFin.rotation.y = Math.PI / 2;
      calfFin.rotation.z = -0.4;
      kneeGroup.add(calfFin);
    }

    // Articulated ankle pivot at y = -0.39 (so sole sits right at ground y = 0)
    ankleGroup.position.set(0, -0.39, 0);
    kneeGroup.add(ankleGroup);

    const foot = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.21, 0.1, 0.36, 0.78, 0.015)),
      secondaryMat,
    );
    foot.position.set(0, 0, 0.06);
    foot.castShadow = true;
    ankleGroup.add(foot);

    const toeCap = new THREE.Mesh(
      trackGeo(makeBevelPlate(0.16, 0.08, 0.12, 0.7, 0.01)),
      primaryMat,
    );
    toeCap.position.set(0, -0.01, 0.22);
    ankleGroup.add(toeCap);
  };

  buildLeg(leftHip, leftKnee, leftAnkle, -1, legsStyle);
  buildLeg(rightHip, rightKnee, rightAnkle, 1, legsStyle);

  const legKinematics: LegKinematicsInfo = {
    hipLChar: new THREE.Vector3(-0.2, 0.82, 0),
    hipRChar: new THREE.Vector3(0.2, 0.82, 0),
    thighLenL: 0.36,
    shinLenL: 0.39,
    thighLenR: 0.36,
    shinLenR: 0.39,
    soleHeightL: 0.068,
    soleHeightR: 0.068,
    restHipXL: 0,
    restHipZL: 0,
    restKneeXL: 0,
    restHipXR: 0,
    restHipZR: 0,
    restKneeXR: 0,
    scale: 1,
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return {
    root,
    bodyGroup,
    pelvis,
    torsoPivot,
    headPivot,
    leftShoulder,
    leftElbow,
    rightShoulder,
    rightElbow,
    leftHip,
    leftKnee,
    leftAnkle,
    rightHip,
    rightKnee,
    rightAnkle,
    boosterPivot,
    weaponPivot,
    shieldPivot,
    muzzlePoint,
    bladeTipPoint,
    bladeBasePoint,
    legKinematics,
    thrusterFlames,
    shadowDisc,
    guardBubble,
    hitFlashMaterials,
    dispose,
  };
}
