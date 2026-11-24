import * as THREE from 'three';

export interface LegKinematicsInfo {
  hipLChar: THREE.Vector3;
  hipRChar: THREE.Vector3;
  thighLenL: number;
  shinLenL: number;
  thighLenR: number;
  shinLenR: number;
  soleHeightL: number;
  soleHeightR: number;
  restHipXL: number;
  restHipZL: number;
  restKneeXL: number;
  restHipXR: number;
  restHipZR: number;
  restKneeXR: number;
  scale: number;
}

export interface FootPlantTrack {
  isPlanted: boolean;
  plantWorld: THREE.Vector3;
  liftStartWorld: THREE.Vector3;
  currentWorld: THREE.Vector3;
  swingTargetWorld: THREE.Vector3;
  liftY: number;
  footPitch: number;
  footRoll: number;
  impactPulse: number;
  correctiveActive: boolean;
  correctiveProgress: number;
}

export interface FighterLocomotionState {
  initialized: boolean;
  left: FootPlantTrack;
  right: FootPlantTrack;
  gaitPhase: number;
  ikWeight: number;
  pelvisYaw: number;
  pelvisShiftX: number;
  cogBobY: number;
  lastMoveDirX: number;
  lastMoveDirZ: number;
  lastStepTurnYaw: number;
  prevMoving: boolean;
  settleTurn: 'L' | 'R';
  idleTurnCooldown: number;
}

export interface SolvedLegAngles {
  hipX: number;
  hipZ: number;
  kneeX: number;
  footX: number;
  footZ: number;
}

export interface FootLocomotionResult {
  ikWeight: number;
  pelvisYaw: number;
  pelvisShiftX: number;
  cogBobY: number;
  torsoCounterYaw: number;
  torsoPitch: number;
  torsoRoll: number;
  headCounterYaw: number;
  armCounterDrive: number;
  armBounce: number;
  forwardAmount: number;
  strafeAmount: number;
  strafeRatio: number;
  speedRatio: number;
  left: SolvedLegAngles;
  right: SolvedLegAngles;
}

function createFootTrack(): FootPlantTrack {
  return {
    isPlanted: true,
    plantWorld: new THREE.Vector3(),
    liftStartWorld: new THREE.Vector3(),
    currentWorld: new THREE.Vector3(),
    swingTargetWorld: new THREE.Vector3(),
    liftY: 0,
    footPitch: 0,
    footRoll: 0,
    impactPulse: 0,
    correctiveActive: false,
    correctiveProgress: 0,
  };
}

export function createFighterLocomotionState(): FighterLocomotionState {
  return {
    initialized: false,
    left: createFootTrack(),
    right: createFootTrack(),
    gaitPhase: 0,
    ikWeight: 1,
    pelvisYaw: 0,
    pelvisShiftX: 0,
    cogBobY: 0,
    lastMoveDirX: 0,
    lastMoveDirZ: 1,
    lastStepTurnYaw: 0,
    prevMoving: false,
    settleTurn: 'L',
    idleTurnCooldown: 0,
  };
}

function smoothstep01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function wrapAnglePi(a: number): number {
  let out = a % (Math.PI * 2);
  if (out > Math.PI) out -= Math.PI * 2;
  if (out < -Math.PI) out += Math.PI * 2;
  return out;
}

function wrap02Pi(a: number): number {
  const tau = Math.PI * 2;
  const r = a % tau;
  return r < 0 ? r + tau : r;
}

/**
 * Exact 3D Analytical Two-Bone Leg IK in character ('ZXY' hip Euler) space.
 * Solves hipX (sagittal), hipZ (coronal abduction), and kneeX (backward flexion >= 0.08)
 * so the ankle reaches `ankleTargetChar` from `hipRestChar`.
 */
export function solveTwoBoneLegIkCharSpace(
  hipRestChar: THREE.Vector3,
  ankleTargetChar: THREE.Vector3,
  thighLen: number,
  shinLen: number,
  restHipX: number,
  restHipZ: number,
  restKneeX: number,
  footPitchOffset: number,
  footRollOffset: number,
): SolvedLegAngles {
  const dx = ankleTargetChar.x - hipRestChar.x;
  let dy = ankleTargetChar.y - hipRestChar.y;
  const dz = ankleTargetChar.z - hipRestChar.z;

  // Never invert the hip above the socket during grounded locomotion
  if (dy > -0.14) dy = -0.14;

  const s = Math.max(0.08, Math.hypot(dx, dy));
  const hipZAbs = THREE.MathUtils.clamp(Math.atan2(dx, -dy), -0.72, 0.72);

  const rawDist = Math.hypot(s, dz);
  const minDist = Math.max(0.16, Math.abs(thighLen - shinLen) + 0.04);
  // Keep ~8 deg natural knee cushion at max extension to avoid robotic straight-leg pops
  const maxDist = (thighLen + shinLen) * 0.992;
  const dist = THREE.MathUtils.clamp(rawDist, minDist, maxDist);

  const aimX = Math.atan2(-dz, s);
  const cosKnee = THREE.MathUtils.clamp(
    (dist * dist - thighLen * thighLen - shinLen * shinLen) / Math.max(0.0001, 2 * thighLen * shinLen),
    -0.94,
    0.992,
  );
  const kneeAbs = Math.acos(cosKnee);

  const cosDelta = THREE.MathUtils.clamp(
    (dist * dist + thighLen * thighLen - shinLen * shinLen) / Math.max(0.0001, 2 * thighLen * dist),
    -0.99,
    0.999,
  );
  const delta = Math.acos(cosDelta);
  const hipXAbs = aimX - delta;

  const hipX = hipXAbs - restHipX;
  const hipZ = hipZAbs - restHipZ;
  const kneeX = kneeAbs - restKneeX;

  // Keep foot sole flat on ground by canceling relative sagittal & lateral leg tilt from rest,
  // then layer heel-strike / toe-off / lateral edge roll on top.
  const footX = -(hipX + kneeX) + footPitchOffset;
  const footZ = -hipZ * 0.92 + footRollOffset;

  return { hipX, hipZ, kneeX, footX, footZ };
}

const _homeWorldL = new THREE.Vector3();
const _homeWorldR = new THREE.Vector3();
const _ankleCharL = new THREE.Vector3();
const _ankleCharR = new THREE.Vector3();

function worldFootToCharAnkle(
  footWorld: THREE.Vector3,
  liftY: number,
  footPitch: number,
  soleHeight: number,
  fighterPos: THREE.Vector3,
  facingYaw: number,
  pelvisYaw: number,
  pelvisShiftX: number,
  cogBobY: number,
  out: THREE.Vector3,
) {
  const dx = footWorld.x - fighterPos.x;
  const dz = footWorld.z - fighterPos.z;
  // 1. World -> root local (undo facingYaw)
  const cosF = Math.cos(facingYaw);
  const sinF = Math.sin(facingYaw);
  const rootX = dx * cosF - dz * sinF - pelvisShiftX;
  const rootZ = dx * sinF + dz * cosF;
  // 2. Root local -> bodyGroup local (undo pelvisYaw)
  const cosP = Math.cos(pelvisYaw);
  const sinP = Math.sin(pelvisYaw);
  const localX = rootX * cosP - rootZ * sinP;
  const localZ = rootX * sinP + rootZ * cosP;

  // Lift ankle slightly when rolling onto heel or toe so the sole edge touches ground cleanly
  const rollAnkleLift = Math.sin(Math.min(0.65, Math.abs(footPitch))) * (soleHeight * 0.72 + 0.025);
  const localY = (footWorld.y - fighterPos.y) + liftY + soleHeight + rollAnkleLift - cogBobY;
  out.set(localX, localY, localZ);
}

function charOffsetToWorld(
  localX: number,
  localZ: number,
  fighterPos: THREE.Vector3,
  facingYaw: number,
  out: THREE.Vector3,
) {
  const cosY = Math.cos(facingYaw);
  const sinY = Math.sin(facingYaw);
  out.set(
    fighterPos.x + localX * cosY + localZ * sinY,
    fighterPos.y,
    fighterPos.z - localX * sinY + localZ * cosY,
  );
}

export function updateFootLocomotion(params: {
  state: FighterLocomotionState;
  kinematics: LegKinematicsInfo;
  fighterPos: THREE.Vector3;
  velX: number;
  velZ: number;
  facingYaw: number;
  maxMoveSpeed: number;
  isGrounded: boolean;
  allowIk: boolean;
  stanceStyle: 'rifle' | 'lance' | 'kodachi' | 'hammer' | 'blade';
  elapsed: number;
  dt: number;
  aiming?: boolean;
  guarding?: boolean;
  landingSquash?: number;
  dodgeDir?: 'left' | 'back' | 'right' | null;
  dodgeLean?: number;
}): FootLocomotionResult {
  const {
    state,
    kinematics,
    fighterPos,
    velX,
    velZ,
    facingYaw,
    maxMoveSpeed,
    isGrounded,
    allowIk,
    stanceStyle,
    elapsed,
    dt,
    aiming = false,
    guarding = false,
    landingSquash = 0,
    dodgeDir = null,
    dodgeLean = 0,
  } = params;

  const hs = kinematics.scale;
  const speed = Math.hypot(velX, velZ);
  const normMax = Math.max(0.5, maxMoveSpeed);
  const speedRatio = THREE.MathUtils.clamp(speed / normMax, 0, 1.45);
  const sprint = THREE.MathUtils.clamp((speedRatio - 0.56) / 0.62, 0, 1);

  const fwdX = Math.sin(facingYaw);
  const fwdZ = Math.cos(facingYaw);
  // Screen-right in Three.js when looking along (fwdX, fwdZ): (-fwdZ, 0, fwdX), which is -X when facing +Z
  const rightX = -fwdZ;
  const rightZ = fwdX;

  const vFwd = velX * fwdX + velZ * fwdZ;
  const vRight = velX * rightX + velZ * rightZ;

  // Local movement projections relative to character gaze [-1, 1]
  const forwardAmount = THREE.MathUtils.clamp(vFwd / normMax, -1, 1);
  const strafeAmount = THREE.MathUtils.clamp(vRight / normMax, -1, 1);
  const absFwd = Math.abs(forwardAmount);
  const absStrafe = Math.abs(strafeAmount);

  // Smooth directional weights for longitudinal vs lateral side-step blending
  const fwdRaw = Math.pow(absFwd, 1.35);
  const strafeRaw = Math.pow(absStrafe, 1.35);
  const rawSum = fwdRaw + strafeRaw;
  const wFwd = rawSum > 0.0001 ? fwdRaw / rawSum : 1;
  const wStrafe = rawSum > 0.0001 ? strafeRaw / rawSum : 0;

  const isMoving = isGrounded && allowIk && speed > 0.24 && dodgeLean <= 0.02;
  const isBackward = forwardAmount < -0.08;
  const fwdDirSign = forwardAmount >= 0 ? 1 : -1;
  const strafeDirSign = strafeAmount >= 0 ? 1 : -1; // +1 = Right (-X), -1 = Left (+X)

  // Combat stance rest offsets around each hip's actual X side
  const leftSign = kinematics.hipLChar.x >= 0 ? 1 : -1;
  const rightSign = kinematics.hipRChar.x >= 0 ? 1 : -1;
  const minSpread = 0.145 * hs;
  const baseWidthL =
    Math.abs(kinematics.hipLChar.x) > 0.04
      ? kinematics.hipLChar.x * 1.14
      : leftSign * minSpread;
  const baseWidthR =
    Math.abs(kinematics.hipRChar.x) > 0.04
      ? kinematics.hipRChar.x * 1.14
      : rightSign * minSpread;
  // Slightly wider athletic lateral stance when side-stepping, or wide regal stance for idle hammer
  const isHammerIdle = stanceStyle === 'hammer' && !isMoving && !aiming && !guarding;
  const widthScale = isHammerIdle
    ? 1.32
    : THREE.MathUtils.lerp(1.0, 1.06, isMoving ? wStrafe : 0);
  const homeLX = baseWidthL * widthScale;
  const homeRX = baseWidthR * widthScale;

  // In longitudinal/idle stance, keep bladed front-back stagger; in pure strafe, feet align side-by-side (zero Z stagger)!
  const baseStagger =
    stanceStyle === 'rifle'
      ? 0.125 * hs
      : stanceStyle === 'lance'
        ? 0.115 * hs
        : stanceStyle === 'hammer'
          ? 0.135 * hs
          : 0.1 * hs;
  const activeStagger = baseStagger * (isMoving ? 1 - wStrafe * 0.92 : 1);
  const homeLZ = activeStagger;
  const homeRZ = -activeStagger;

  charOffsetToWorld(homeLX, homeLZ, fighterPos, facingYaw, _homeWorldL);
  charOffsetToWorld(homeRX, homeRZ, fighterPos, facingYaw, _homeWorldR);
  const homeWorldL = _homeWorldL;
  const homeWorldR = _homeWorldR;

  // Smoothly ramp IK weight in on ground & out during jumps/dashes/melee strikes
  const targetIkWeight = isGrounded && allowIk ? 1 : 0;
  state.ikWeight = THREE.MathUtils.damp(
    state.ikWeight,
    targetIkWeight,
    targetIkWeight > 0.5 ? 16 : 20,
    dt,
  );

  // Re-initialize planted feet cleanly at current ground stance when starting or landing
  if (!state.initialized || (!allowIk && !isGrounded) || state.ikWeight < 0.04) {
    state.initialized = true;
    state.left.isPlanted = true;
    state.left.plantWorld.copy(homeWorldL);
    state.left.liftStartWorld.copy(homeWorldL);
    state.left.currentWorld.copy(homeWorldL);
    state.left.swingTargetWorld.copy(homeWorldL);
    state.left.liftY = 0;
    state.left.footPitch = 0;
    state.left.footRoll = 0;
    state.left.impactPulse = 0;
    state.left.correctiveActive = false;

    state.right.isPlanted = true;
    state.right.plantWorld.copy(homeWorldR);
    state.right.liftStartWorld.copy(homeWorldR);
    state.right.currentWorld.copy(homeWorldR);
    state.right.swingTargetWorld.copy(homeWorldR);
    state.right.liftY = 0;
    state.right.footPitch = 0;
    state.right.footRoll = 0;
    state.right.impactPulse = 0;
    state.right.correctiveActive = false;

    state.lastStepTurnYaw = facingYaw;
    state.prevMoving = false;
  }

  state.idleTurnCooldown = Math.max(0, state.idleTurnCooldown - dt);
  state.left.impactPulse = Math.max(0, state.left.impactPulse - dt * 5.2);
  state.right.impactPulse = Math.max(0, state.right.impactPulse - dt * 5.2);

  const maxLegLenL = kinematics.thighLenL + kinematics.shinLenL;
  const maxLegLenR = kinematics.thighLenR + kinematics.shinLenR;
  const avgLegLen = 0.5 * (maxLegLenL + maxLegLenR);

  // Longer, wider deliberate strides -> slower, weightier cadence without foot sliding
  const fwdStepDist = THREE.MathUtils.lerp(1.18, 1.68, sprint) * avgLegLen * (aiming || guarding ? 0.85 : 1);
  const strafeStepDist = THREE.MathUtils.lerp(0.78, 1.06, sprint) * avgLegLen * (aiming || guarding ? 0.86 : 1);
  const stepDist = wFwd * fwdStepDist + wStrafe * strafeStepDist;
  const maxPlantReach = avgLegLen * 0.94;

  // Longitudinal & Lateral Pelvis / Upper-Body variables (blended cleanly below)
  let fwdPelvisYaw = 0;
  let strafePelvisYaw = 0;
  let fwdShiftX = 0;
  let strafeShiftX = 0;
  let fwdBobY = 0;
  let strafeBobY = 0;

  // Determine which rig side is physically on +X (Left in Three.js) vs -X (Right in Three.js)
  const posXTrack = leftSign > 0 ? state.left : state.right;
  const negXTrack = leftSign > 0 ? state.right : state.left;

  if (isMoving) {
    state.lastMoveDirX = velX / speed;
    state.lastMoveDirZ = velZ / speed;

    // On movement start: pick phase so the lead foot steps out first (especially during strafe)!
    if (!state.prevMoving) {
      if (wStrafe > 0.4) {
        // Right strafe (+1, moving -X) -> -X leg is Lead -> start at uNeg = 0.08*PI (gaitPhase = 1.08*PI)
        // Left strafe (-1, moving +X)  -> +X leg is Lead -> start at uPos = 0.08*PI (gaitPhase = 0.08*PI)
        state.gaitPhase = strafeAmount >= 0 ? Math.PI * 1.08 : Math.PI * 0.08;
      } else {
        const mvX = velX / speed;
        const mvZ = velZ / speed;
        const pAhead = (posXTrack.plantWorld.x - fighterPos.x) * mvX + (posXTrack.plantWorld.z - fighterPos.z) * mvZ;
        const nAhead = (negXTrack.plantWorld.x - fighterPos.x) * mvX + (negXTrack.plantWorld.z - fighterPos.z) * mvZ;
        state.gaitPhase = pAhead >= nAhead ? Math.PI * 1.08 : Math.PI * 0.08;
      }
      state.left.correctiveActive = false;
      state.right.correctiveActive = false;
    }

    const dPhase = (speed * dt / Math.max(0.42, stepDist)) * Math.PI * 0.92;
    state.gaitPhase = wrap02Pi(state.gaitPhase + dPhase);

    // Guaranteed double-support schedule:
    // Active swing = [0.06*PI, 0.86*PI] (40% cycle); Stance = remaining 60% of cycle.
    // Because opposite leg is shifted by +PI, at least ONE foot is ALWAYS planted on the floor!
    const swingStart = 0.06 * Math.PI;
    const swingEnd = 0.86 * Math.PI;
    const swingSpan = swingEnd - swingStart;
    const stanceSpan = Math.PI * 2 - swingSpan;

    const fwdLead = Math.min(avgLegLen * 0.64, fwdStepDist * 0.52) * fwdDirSign;
    const fwdClearance = THREE.MathUtils.lerp(0.18, 0.30, sprint) * hs;
    const strafeClearance = THREE.MathUtils.lerp(0.13, 0.20, sprint) * hs;

    // Lateral Side-Step reaches: Lead leg abducts cleanly outward; Trail leg gathers back to stance width (no crossover)
    const leadStepOutDist = Math.min(avgLegLen * 0.54, strafeStepDist * 0.65);
    const trailGatherDist = Math.min(avgLegLen * 0.16, strafeStepDist * 0.16);

    const updateDualFormulaFoot = (
      track: FootPlantTrack,
      uRaw: number,
      homeWorld: THREE.Vector3,
      isPosXSide: boolean,
    ) => {
      const u = wrap02Pi(uRaw);
      const inSwing = u >= swingStart && u < swingEnd;

      // In Three.js facing +Z, Right (+strafeAmount) is -X; Left (-strafeAmount) is +X
      const isLeadStrafeLeg = (strafeAmount >= 0 && !isPosXSide) || (strafeAmount < 0 && isPosXSide);

      if (!inSwing) {
        if (!track.isPlanted) {
          // Foot just touched ground: lock its world coordinates cleanly on the floor!
          track.isPlanted = true;
          track.plantWorld.copy(track.currentWorld);
          track.plantWorld.y = fighterPos.y;
          track.impactPulse = Math.max(track.impactPulse, 0.65 + sprint * 0.28);
        }
        track.plantWorld.y = fighterPos.y;

        // Safety tether only if extreme velocity pulls hip past anatomical leg reach
        const rx = track.plantWorld.x - homeWorld.x;
        const rz = track.plantWorld.z - homeWorld.z;
        const rDist = Math.hypot(rx, rz);
        if (rDist > maxPlantReach) {
          const pull = (rDist - maxPlantReach) / rDist;
          track.plantWorld.x -= rx * pull;
          track.plantWorld.z -= rz * pull;
        }

        track.currentWorld.copy(track.plantWorld);
        track.liftY = 0;

        // Stance normalized progress [0..1] from touchdown (swingEnd) to liftoff (swingStart + 2PI)
        const sProg = wrap02Pi(u - swingEnd) / stanceSpan;

        // Formula 1 (Longitudinal) foot roll: heel-strike -> flat sole -> toe push-off
        let fwdPitch = 0;
        if (sProg < 0.16) {
          fwdPitch = THREE.MathUtils.lerp(-0.18 * fwdDirSign, 0, sProg / 0.16);
        } else if (sProg > 0.74) {
          const pushT = smoothstep01((sProg - 0.74) / 0.26);
          fwdPitch = pushT * (0.28 + 0.14 * sprint) * fwdDirSign;
        }
        const fwdRoll = 0;

        // Formula 2 (Lateral Side-Step) foot pressure: flat sole with gentle inward push-off roll
        const strafePitch = 0;
        const strafeRoll = -strafeAmount * 0.08 * (1 - Math.max(0, (sProg - 0.72) / 0.28));

        track.footPitch = wFwd * fwdPitch + wStrafe * strafePitch;
        track.footRoll = wFwd * fwdRoll + wStrafe * strafeRoll;
      } else {
        if (track.isPlanted) {
          // Liftoff from planted anchor
          track.isPlanted = false;
          track.liftStartWorld.copy(track.plantWorld);
        }
        const t = THREE.MathUtils.clamp((u - swingStart) / swingSpan, 0, 1);

        // --- Formula 1 Target (Longitudinal forward/back step along fwdVec only) ---
        const fwdTargetX = homeWorld.x + fwdX * fwdLead;
        const fwdTargetZ = homeWorld.z + fwdZ * fwdLead;

        // --- Formula 2 Target (Lateral przy-stavnoy step along rightVec ONLY, ZERO Z movement!) ---
        const lateralDist = isLeadStrafeLeg ? leadStepOutDist : trailGatherDist;
        const latX = rightX * strafeDirSign * lateralDist;
        const latZ = rightZ * strafeDirSign * lateralDist;
        const strafeTargetX = homeWorld.x + latX;
        const strafeTargetZ = homeWorld.z + latZ;

        // Blend Formula 1 & Formula 2 foot landing targets smoothly for diagonals (W+D, S+A, etc.)
        track.swingTargetWorld.set(
          wFwd * fwdTargetX + wStrafe * strafeTargetX,
          fighterPos.y,
          wFwd * fwdTargetZ + wStrafe * strafeTargetZ,
        );

        const swingT = THREE.MathUtils.lerp(smoothstep01(t), t, 0.18);
        track.currentWorld.x = THREE.MathUtils.lerp(track.liftStartWorld.x, track.swingTargetWorld.x, swingT);
        track.currentWorld.z = THREE.MathUtils.lerp(track.liftStartWorld.z, track.swingTargetWorld.z, swingT);
        track.currentWorld.y = fighterPos.y;

        // Lift arc & knee fold clearance (distinct height for forward stride vs crisp lateral step/gather)
        const liftArc = Math.pow(Math.sin(Math.PI * t), 0.84);
        const legClearance = wFwd * fwdClearance + wStrafe * (isLeadStrafeLeg ? strafeClearance : strafeClearance * 0.92);
        track.liftY = liftArc * legClearance;

        // Formula 1 swing ankle pitch vs Formula 2 level lateral ankle
        const fwdSwingPitch =
          t < 0.35
            ? THREE.MathUtils.lerp(0.28 * fwdDirSign, 0, t / 0.35)
            : THREE.MathUtils.lerp(0, -0.18 * fwdDirSign, (t - 0.35) / 0.65);
        const strafeSwingPitch = Math.sin(Math.PI * t) * 0.04;
        const strafeSwingRoll = -strafeAmount * 0.06 * Math.sin(Math.PI * t);

        track.footPitch = wFwd * fwdSwingPitch + wStrafe * strafeSwingPitch;
        track.footRoll = wStrafe * strafeSwingRoll;
      }
    };

    const uPos = wrap02Pi(state.gaitPhase);
    const uNeg = wrap02Pi(state.gaitPhase + Math.PI);
    if (leftSign > 0) {
      updateDualFormulaFoot(state.left, uPos, homeWorldL, true);
      updateDualFormulaFoot(state.right, uNeg, homeWorldR, false);
    } else {
      updateDualFormulaFoot(state.left, uNeg, homeWorldL, false);
      updateDualFormulaFoot(state.right, uPos, homeWorldR, true);
    }

    // --- Formula 1 Pelvis Dynamics (Longitudinal stride) ---
    fwdPelvisYaw = -Math.cos(state.gaitPhase) * (0.075 + 0.045 * sprint);
    const posSup = posXTrack.isPlanted ? 1 : 0;
    const negSup = negXTrack.isPlanted ? 1 : 0;
    fwdShiftX = (posSup - negSup) * 0.022 * hs + Math.sin(state.gaitPhase) * 0.018 * hs;
    fwdBobY = -Math.cos(state.gaitPhase * 2) * 0.028 * (0.65 + 0.55 * sprint) * hs;

    // --- Formula 2 Pelvis Dynamics (20-30° turn into strafe + lateral weight transfer & dip onto Lead leg) ---
    // Turn pelvis 22–28° (0.38..0.49 rad) toward movement direction: negative Y turns toward -X (Right)
    strafePelvisYaw = -strafeAmount * THREE.MathUtils.lerp(0.38, 0.48, sprint);
    // Weight shift cycle: Phase 1 (Lead swinging out) -> Phase 2 (weight shifts over planted Lead leg & dips!)
    const leadCyclePhase = strafeAmount >= 0 ? uNeg : uPos; // 0..PI = Lead steps out, PI..2PI = Lead planted & Trail gathers
    const overLeadTransfer = THREE.MathUtils.smoothstep(Math.sin(leadCyclePhase - Math.PI), -0.35, 0.75);
    strafeShiftX = -strafeAmount * (0.025 + 0.062 * overLeadTransfer) * hs;
    strafeBobY = (-0.016 - 0.026 * overLeadTransfer - 0.014 * Math.sin(leadCyclePhase * 2)) * hs;

    state.prevMoving = true;
  } else if (isGrounded && allowIk) {
    // Idle / Stopping / In-Place Turning:
    // Finish any in-flight swing smoothly onto homeWorld, then allow single-leg corrective stance resets.
    const finishSwingOrSettle = (
      track: FootPlantTrack,
      homeWorld: THREE.Vector3,
    ) => {
      if (!track.isPlanted && !track.correctiveActive) {
        track.correctiveActive = true;
        track.correctiveProgress = 0.35;
        track.liftStartWorld.copy(track.currentWorld);
        track.swingTargetWorld.copy(homeWorld);
      }

      if (track.correctiveActive) {
        track.correctiveProgress = Math.min(1, track.correctiveProgress + dt * 5.4);
        const t = track.correctiveProgress;
        track.swingTargetWorld.copy(homeWorld);
        const sT = smoothstep01(t);
        track.currentWorld.x = THREE.MathUtils.lerp(track.liftStartWorld.x, track.swingTargetWorld.x, sT);
        track.currentWorld.z = THREE.MathUtils.lerp(track.liftStartWorld.z, track.swingTargetWorld.z, sT);
        track.currentWorld.y = fighterPos.y;
        track.liftY = Math.sin(Math.PI * t) * 0.095 * hs;
        track.footPitch = Math.sin(Math.PI * t) * -0.08;
        track.footRoll = 0;

        if (t >= 1) {
          track.correctiveActive = false;
          track.isPlanted = true;
          track.plantWorld.copy(homeWorld);
          track.currentWorld.copy(homeWorld);
          track.liftY = 0;
          track.footPitch = 0;
          track.impactPulse = Math.max(track.impactPulse, 0.45);
        }
        return;
      }

      // Planted idle: keep foot locked on floor
      track.plantWorld.y = fighterPos.y;
      track.currentWorld.copy(track.plantWorld);
      track.liftY = 0;
      track.footPitch = THREE.MathUtils.damp(track.footPitch, 0, 14, dt);
      track.footRoll = THREE.MathUtils.damp(track.footRoll, 0, 14, dt);

      const rx = track.plantWorld.x - homeWorld.x;
      const rz = track.plantWorld.z - homeWorld.z;
      const rDist = Math.hypot(rx, rz);
      if (rDist > maxPlantReach * 0.88) {
        const pull = (rDist - maxPlantReach * 0.88) / rDist;
        track.plantWorld.x -= rx * pull;
        track.plantWorld.z -= rz * pull;
      }
    };

    finishSwingOrSettle(state.left, homeWorldL);
    finishSwingOrSettle(state.right, homeWorldR);

    if (
      state.left.isPlanted &&
      state.right.isPlanted &&
      !state.left.correctiveActive &&
      !state.right.correctiveActive &&
      state.idleTurnCooldown <= 0 &&
      dodgeLean <= 0.02
    ) {
      const errL = Math.hypot(
        state.left.plantWorld.x - homeWorldL.x,
        state.left.plantWorld.z - homeWorldL.z,
      );
      const errR = Math.hypot(
        state.right.plantWorld.x - homeWorldR.x,
        state.right.plantWorld.z - homeWorldR.z,
      );
      const turnDelta = Math.abs(wrapAnglePi(facingYaw - state.lastStepTurnYaw));
      const needsReset = errL > 0.18 * hs || errR > 0.18 * hs || turnDelta > 0.46;

      if (needsReset) {
        const pickLeft = errL > errR + 0.02 * hs || (Math.abs(errL - errR) <= 0.02 * hs && state.settleTurn === 'L');
        const chosen = pickLeft ? state.left : state.right;
        const chosenHome = pickLeft ? homeWorldL : homeWorldR;
        chosen.isPlanted = false;
        chosen.correctiveActive = true;
        chosen.correctiveProgress = 0;
        chosen.liftStartWorld.copy(chosen.plantWorld);
        chosen.swingTargetWorld.copy(chosenHome);
        state.settleTurn = pickLeft ? 'R' : 'L';
        state.idleTurnCooldown = 0.08;
        state.lastStepTurnYaw = facingYaw;
      }
    }
    state.prevMoving = false;
  }

  // Pelvis Rotation & Upper Body Isolation: blend longitudinal vs lateral strafe cleanly
  const moveBlend = isMoving ? smoothstep01(speedRatio / 0.22) : 0;
  const idleStanceYaw =
    stanceStyle === 'lance' ? -0.07 : stanceStyle === 'kodachi' ? -0.12 : stanceStyle === 'rifle' ? 0.06 : 0;
  const blendedMovingPelvisYaw = wFwd * fwdPelvisYaw + wStrafe * strafePelvisYaw;
  const targetPelvisYaw = THREE.MathUtils.lerp(idleStanceYaw, blendedMovingPelvisYaw, moveBlend);
  state.pelvisYaw = THREE.MathUtils.damp(state.pelvisYaw, targetPelvisYaw, 13, dt);

  const breath = Math.sin(elapsed * 2.05) + 0.24 * Math.sin(elapsed * 4.1 + 0.4);
  const idleWeight = Math.sin(elapsed * 0.92);
  const blendedMovingShiftX = wFwd * fwdShiftX + wStrafe * strafeShiftX;
  const dodgeShiftX =
    dodgeLean > 0.01
      ? (dodgeDir === 'left' ? 0.16 : dodgeDir === 'right' ? -0.16 : 0) * hs * dodgeLean
      : 0;
  const targetShiftX = isMoving
    ? blendedMovingShiftX * moveBlend
    : idleWeight * 0.016 * hs * (1 - dodgeLean) + dodgeShiftX;
  state.pelvisShiftX = THREE.MathUtils.damp(state.pelvisShiftX, targetShiftX, dodgeLean > 0.01 ? 20 : 12, dt);

  // Center of Gravity (CoG) Vertical Bob + Grounding Cap
  const isRegalHammerIdle = stanceStyle === 'hammer' && !isMoving && !aiming && !guarding;
  const athleticDrop =
    (aiming || guarding
      ? -0.058
      : isRegalHammerIdle
        ? -0.016
        : -0.042 - (isMoving ? wStrafe * 0.016 : 0)) * hs -
    landingSquash * hs -
    dodgeLean * 0.15 * hs;
  const blendedStepBob =
    isMoving
      ? (wFwd * fwdBobY + wStrafe * strafeBobY - (state.left.impactPulse + state.right.impactPulse) * 0.012 * hs) *
        moveBlend
      : (breath * 0.012 * hs) * (1 - dodgeLean) - (state.left.impactPulse + state.right.impactPulse) * 0.012 * hs;

  let desiredCogY = athleticDrop + blendedStepBob;

  // Enforce physical reach cap for every planted foot so NO planted foot EVER floats!
  const cosF = Math.cos(facingYaw);
  const sinF = Math.sin(facingYaw);
  const cosP = Math.cos(state.pelvisYaw);
  const sinP = Math.sin(state.pelvisYaw);
  const computeMaxPelvisDropForFoot = (
    footWorld: THREE.Vector3,
    hipRestChar: THREE.Vector3,
    thighLen: number,
    shinLen: number,
    soleHeight: number,
  ): number => {
    const dx = footWorld.x - fighterPos.x;
    const dz = footWorld.z - fighterPos.z;
    const rootX = dx * cosF - dz * sinF - state.pelvisShiftX;
    const rootZ = dx * sinF + dz * cosF;
    const footLocalX = rootX * cosP - rootZ * sinP;
    const footLocalZ = rootX * sinP + rootZ * cosP;
    const horizDist = Math.hypot(footLocalX - hipRestChar.x, footLocalZ - hipRestChar.z);
    const comfReach = (thighLen + shinLen) * 0.974;
    const maxVerticalSpan = Math.sqrt(Math.max(0.06, comfReach * comfReach - horizDist * horizDist));
    const desiredAnkleY = (footWorld.y - fighterPos.y) + soleHeight;
    return desiredAnkleY + maxVerticalSpan - hipRestChar.y;
  };

  if (state.left.isPlanted) {
    const capL = computeMaxPelvisDropForFoot(
      state.left.plantWorld,
      kinematics.hipLChar,
      kinematics.thighLenL,
      kinematics.shinLenL,
      kinematics.soleHeightL,
    );
    desiredCogY = Math.min(desiredCogY, capL);
  }
  if (state.right.isPlanted) {
    const capR = computeMaxPelvisDropForFoot(
      state.right.plantWorld,
      kinematics.hipRChar,
      kinematics.thighLenR,
      kinematics.shinLenR,
      kinematics.soleHeightR,
    );
    desiredCogY = Math.min(desiredCogY, capR);
  }
  desiredCogY = THREE.MathUtils.clamp(desiredCogY, -0.34 * hs, 0.03 * hs);
  state.cogBobY = THREE.MathUtils.damp(state.cogBobY, desiredCogY, 18, dt);

  // Convert current world foot targets into character pelvis space & solve Two-Bone IK with ZERO angular lag!
  worldFootToCharAnkle(
    state.left.currentWorld,
    state.left.liftY,
    state.left.footPitch,
    kinematics.soleHeightL,
    fighterPos,
    facingYaw,
    state.pelvisYaw,
    state.pelvisShiftX,
    state.cogBobY,
    _ankleCharL,
  );
  worldFootToCharAnkle(
    state.right.currentWorld,
    state.right.liftY,
    state.right.footPitch,
    kinematics.soleHeightR,
    fighterPos,
    facingYaw,
    state.pelvisYaw,
    state.pelvisShiftX,
    state.cogBobY,
    _ankleCharR,
  );

  const solvedL = solveTwoBoneLegIkCharSpace(
    kinematics.hipLChar,
    _ankleCharL,
    kinematics.thighLenL,
    kinematics.shinLenL,
    kinematics.restHipXL,
    kinematics.restHipZL,
    kinematics.restKneeXL,
    state.left.footPitch,
    state.left.footRoll,
  );
  const solvedR = solveTwoBoneLegIkCharSpace(
    kinematics.hipRChar,
    _ankleCharR,
    kinematics.thighLenR,
    kinematics.shinLenR,
    kinematics.restHipXR,
    kinematics.restHipZR,
    kinematics.restKneeXR,
    state.right.footPitch,
    state.right.footRoll,
  );

  // Upper torso / shoulders / gaze: counter-rotate pelvis yaw strictly back onto camera/cursor!
  // Longitudinal gets counter-stride twist; lateral strafe stays strictly locked on aim with gentle balance roll.
  const fwdCounterTwist = Math.cos(state.gaitPhase) * (0.09 + 0.06 * sprint) * moveBlend;
  const torsoCounterYaw = -state.pelvisYaw * 0.94 + fwdCounterTwist * wFwd;
  const headCounterYaw = -state.pelvisYaw * 0.06 - fwdCounterTwist * 0.78 * wFwd;

  const fwdTorsoPitch =
    (isBackward ? -0.045 : THREE.MathUtils.lerp(0.045, 0.16, sprint)) *
      Math.min(1, absFwd * 1.35) +
    Math.sin(state.gaitPhase * 2) * 0.018;
  const strafeTorsoPitch = 0.035;
  const torsoPitch = (wFwd * fwdTorsoPitch + wStrafe * strafeTorsoPitch) * moveBlend;

  const fwdTorsoRoll = -Math.sin(state.gaitPhase) * 0.025;
  const strafeTorsoRoll = strafeAmount * (0.065 + 0.03 * sprint);
  const torsoRoll = (wFwd * fwdTorsoRoll + wStrafe * strafeTorsoRoll) * moveBlend;

  const armCounterDrive = Math.sin(state.gaitPhase) * 0.42 * Math.min(1.2, speedRatio) * wFwd;
  const armBounce = Math.cos(state.gaitPhase * 2) * 0.055 * Math.min(1.2, speedRatio);

  return {
    ikWeight: state.ikWeight,
    pelvisYaw: state.pelvisYaw,
    pelvisShiftX: state.pelvisShiftX,
    cogBobY: state.cogBobY,
    torsoCounterYaw,
    torsoPitch,
    torsoRoll,
    headCounterYaw,
    armCounterDrive,
    armBounce,
    forwardAmount,
    strafeAmount,
    strafeRatio: strafeAmount,
    speedRatio,
    left: solvedL,
    right: solvedR,
  };
}
