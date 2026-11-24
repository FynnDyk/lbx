import * as THREE from 'three';
import {
  AiPersonality,
  AiTacticalState,
  ArenaInteractable,
  ArenaObstacle,
  LbxWeapon,
} from './types';

export interface AiPerception {
  aiPos: THREE.Vector3;
  aiHp: number;
  aiMaxHp: number;
  aiEnergy: number;
  aiMaxEnergy: number;
  aiSpecial: number;
  aiAttackCooldown: number;
  aiComboStep: number;
  aiIsStunned: boolean;
  aiWeapon: LbxWeapon;
  aiCanGuard?: boolean;
  aiIsGrounded?: boolean;

  playerPos: THREE.Vector3;
  playerHp: number;
  playerMaxHp: number;
  playerEnergy: number;
  playerIsAttacking: boolean;
  playerAttackPhase: 'none' | 'windup' | 'active' | 'recover';
  playerIsGuarding: boolean;
  playerWeaponIsRanged: boolean;
  playerFacingAngle: number;

  arenaRadius: number;
  obstacles: ArenaObstacle[];
  readyInteractables: ArenaInteractable[];
  dt: number;
}

export interface AiDecisionOutput {
  moveDirX: number;
  moveDirZ: number;
  aimAngle: number;
  wantAttack: boolean;
  wantGuard: boolean;
  wantDash: boolean;
  wantSpecial: boolean;
  wantJump?: boolean;
  tacticalState: AiTacticalState;
}

const _toPlayer = new THREE.Vector3();
const _perp = new THREE.Vector3();
const _steer = new THREE.Vector3();
const _obsVec = new THREE.Vector3();
const _peekTest = new THREE.Vector3();
const _perchPos = new THREE.Vector3();

function hasLineOfSight(
  a: THREE.Vector3,
  b: THREE.Vector3,
  obstacles: ArenaObstacle[],
): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 0.001) return true;
  const aEyeY = a.y + 1.1;
  const bTargetY = b.y + 1.0;

  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const t = Math.max(
      0,
      Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / lenSq),
    );
    const rayY = aEyeY + (bTargetY - aEyeY) * t;
    if (o.height < rayY - 0.12) continue;

    const closestX = a.x + t * dx;
    const closestZ = a.z + t * dz;
    const distSq = (o.x - closestX) ** 2 + (o.z - closestZ) ** 2;
    if (distSq < (o.radius + 0.32) ** 2) {
      return false;
    }
  }
  return true;
}

function pointToSegmentDistSq2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 0.0001) return (px - ax) ** 2 + (pz - az) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq));
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return (px - cx) ** 2 + (pz - cz) ** 2;
}

export class TacticalAiBrain {
  private personality: AiPersonality;
  private decisionTimer = 0;
  private stateHoldTimer = 0;
  private currentState: AiTacticalState = 'APPROACH';
  private flankSign = 1;
  private flankSwitchTimer = 2.4;
  private guardHoldTimer = 0;
  private dashCooldown = 0;
  private retreatTimer = 0;

  // Shared tactical timing, pacing & anti-spam exchange memory
  private aiClock = Math.random() * 10;
  private prevAttackCooldown = 0;
  private prevPlayerGuarding = false;
  private prevPlayerAttackPhase: 'none' | 'windup' | 'active' | 'recover' = 'none';
  private prevAiHp = -1;
  private recentDamageTaken = 0;

  // Ranged sniper pacing & rock perch climbing
  private rangedShotCooldown = 0.65;
  private aimHoldTimer = 0;
  private repositionTimer = 0;
  private guardWaitTimer = 0;
  private targetPerchId: string | null = null;
  private perchReevalTimer = 0;
  private climbJumpCooldown = 0;

  // Melee anti-spam exchange pacing & flank commitment
  private meleePauseTimer = 0.25;
  private currentExchangeHits = 0;
  private exchangeBudget = 2;
  private flankHoldTimer = 0;
  private blockedFrontHits = 0;

  constructor(personality: AiPersonality) {
    this.personality = personality;
    this.flankSign = Math.random() > 0.5 ? 1 : -1;
    this.exchangeBudget = this.rollExchangeBudget();
  }

  private rollExchangeBudget(): number {
    const r = Math.random();
    if (r < this.personality.comboCommit * 0.55) return 3;
    if (r < 0.72) return 2;
    return 1;
  }

  private pickOpenFlankSign(
    aiPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    dirX: number,
    dirZ: number,
    obstacles: ArenaObstacle[],
  ): number {
    const leftX = -dirZ;
    const leftZ = dirX;
    _peekTest.set(aiPos.x + leftX * 2.6, aiPos.y, aiPos.z + leftZ * 2.6);
    const leftOpen = hasLineOfSight(_peekTest, playerPos, obstacles);

    _peekTest.set(aiPos.x - leftX * 2.6, aiPos.y, aiPos.z - leftZ * 2.6);
    const rightOpen = hasLineOfSight(_peekTest, playerPos, obstacles);

    if (leftOpen && !rightOpen) return 1;
    if (rightOpen && !leftOpen) return -1;
    return this.flankSign;
  }

  private findStandingObstacle(
    aiPos: THREE.Vector3,
    obstacles: ArenaObstacle[],
  ): ArenaObstacle | null {
    let best: ArenaObstacle | null = null;
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.destructible) continue;
      const d = Math.hypot(aiPos.x - o.x, aiPos.z - o.z);
      if (d <= o.radius + 0.88 && Math.abs(aiPos.y - o.height) <= 0.48) {
        if (!best || o.height > best.height) {
          best = o;
        }
      }
    }
    return best;
  }

  private findNearestCoverSpot(
    aiPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    obstacles: ArenaObstacle[],
  ): { x: number; z: number } | null {
    let bestScore = Infinity;
    let bestX = 0;
    let bestZ = 0;
    let found = false;

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.destructible) continue;
      const dx = obs.x - playerPos.x;
      const dz = obs.z - playerPos.z;
      const len = Math.max(0.1, Math.hypot(dx, dz));
      const coverX = obs.x + (dx / len) * (obs.radius + 1.45);
      const coverZ = obs.z + (dz / len) * (obs.radius + 1.45);
      const distToSpot = Math.hypot(coverX - aiPos.x, coverZ - aiPos.z);
      if (distToSpot < 16 && distToSpot < bestScore) {
        bestScore = distToSpot;
        bestX = coverX;
        bestZ = coverZ;
        found = true;
      }
    }
    return found ? { x: bestX, z: bestZ } : null;
  }

  private planSniperPerch(
    aiPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    obstacles: ArenaObstacle[],
    standingObs: ArenaObstacle | null,
    weaponRange: number,
  ): { perch: ArenaObstacle; nextStep: ArenaObstacle } | null {
    const climbable = obstacles.filter(
      (o) => !o.destructible && o.height >= 1.05 && o.height <= 4.15,
    );
    if (climbable.length === 0) return null;

    const maxStepJump = 2.25;
    const firstStepByObs = new Map<ArenaObstacle, ArenaObstacle>();
    const queue: ArenaObstacle[] = [];

    for (let i = 0; i < climbable.length; i++) {
      const o = climbable[i];
      if (o.height - aiPos.y <= maxStepJump) {
        firstStepByObs.set(o, o);
        queue.push(o);
      }
    }

    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const curFirst = firstStepByObs.get(cur)!;
      for (let i = 0; i < climbable.length; i++) {
        const nxt = climbable[i];
        if (firstStepByObs.has(nxt)) continue;
        if (nxt.height - cur.height > maxStepJump) continue;
        const edgeGap =
          Math.hypot(nxt.x - cur.x, nxt.z - cur.z) - cur.radius - nxt.radius;
        if (edgeGap <= 2.35) {
          firstStepByObs.set(nxt, curFirst);
          queue.push(nxt);
        }
      }
    }

    if (firstStepByObs.size === 0) return null;

    let bestScore = -Infinity;
    let bestPerch: ArenaObstacle | null = null;
    let bestStep: ArenaObstacle | null = null;

    const idealMax = Math.min(weaponRange * 0.62, 17.0);

    for (let i = 0; i < climbable.length; i++) {
      const obs = climbable[i];
      const step = firstStepByObs.get(obs);
      if (!step) continue;

      const distToPlayer = Math.hypot(obs.x - playerPos.x, obs.z - playerPos.z);
      const distFromAi = Math.hypot(obs.x - aiPos.x, obs.z - aiPos.z);

      let score = obs.height * 4.2;

      if (distToPlayer < 6.5) {
        score -= 18 + (6.5 - distToPlayer) * 3.0;
      } else if (distToPlayer <= idealMax) {
        score += 20 - Math.abs(distToPlayer - 13.0) * 0.75;
      } else {
        score -= (distToPlayer - idealMax) * 1.6;
      }

      _perchPos.set(obs.x, obs.height, obs.z);
      if (hasLineOfSight(_perchPos, playerPos, obstacles)) {
        score += 9.5;
      } else {
        score -= 8.0;
      }

      score -= distFromAi * 0.42;

      if (
        !standingObs &&
        distFromAi > 5.0 &&
        pointToSegmentDistSq2D(
          playerPos.x,
          playerPos.z,
          aiPos.x,
          aiPos.z,
          obs.x,
          obs.z,
        ) <
          6.5 ** 2
      ) {
        score -= 18;
      }

      if (standingObs && standingObs.id === obs.id) {
        score += 5.5;
      }
      if (this.targetPerchId === obs.id) {
        score += 6.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPerch = obs;
        bestStep = step;
      }
    }

    if (!bestPerch || !bestStep) return null;
    return { perch: bestPerch, nextStep: bestStep };
  }

  public update(p: AiPerception): AiDecisionOutput {
    const dt = p.dt;
    this.aiClock += dt;
    this.decisionTimer -= dt;
    this.stateHoldTimer = Math.max(0, this.stateHoldTimer - dt);
    this.guardHoldTimer = Math.max(0, this.guardHoldTimer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.retreatTimer = Math.max(0, this.retreatTimer - dt);
    this.rangedShotCooldown = Math.max(0, this.rangedShotCooldown - dt);
    this.repositionTimer = Math.max(0, this.repositionTimer - dt);
    this.meleePauseTimer = Math.max(0, this.meleePauseTimer - dt);
    this.flankHoldTimer = Math.max(0, this.flankHoldTimer - dt);
    this.perchReevalTimer = Math.max(0, this.perchReevalTimer - dt);
    this.climbJumpCooldown = Math.max(0, this.climbJumpCooldown - dt);
    this.flankSwitchTimer -= dt;

    if (this.prevAiHp < 0) {
      this.prevAiHp = p.aiHp;
    } else {
      const dmgTaken = Math.max(0, this.prevAiHp - p.aiHp);
      this.recentDamageTaken = Math.max(0, this.recentDamageTaken - dt * 65) + dmgTaken;
      this.prevAiHp = p.aiHp;
    }

    const justCommittedAttack =
      this.prevAttackCooldown <= 0.02 && p.aiAttackCooldown > 0.08;
    this.prevAttackCooldown = p.aiAttackCooldown;

    const playerDroppedGuard = this.prevPlayerGuarding && !p.playerIsGuarding;
    this.prevPlayerGuarding = p.playerIsGuarding;

    const playerEnteredRecover =
      this.prevPlayerAttackPhase !== 'recover' && p.playerAttackPhase === 'recover';
    this.prevPlayerAttackPhase = p.playerAttackPhase;

    if (this.flankSwitchTimer <= 0) {
      this.flankSign *= -1;
      this.flankSwitchTimer = 1.9 + Math.random() * 2.2;
    }

    _toPlayer.subVectors(p.playerPos, p.aiPos);
    _toPlayer.y = 0;
    const dist = Math.max(0.01, _toPlayer.length());
    const dirX = _toPlayer.x / dist;
    const dirZ = _toPlayer.z / dist;
    const aimAngle = Math.atan2(dirX, dirZ);

    const energyRatio = p.aiEnergy / p.aiMaxEnergy;
    const hpRatio = p.aiHp / p.aiMaxHp;
    const los = hasLineOfSight(p.aiPos, p.playerPos, p.obstacles);

    const pForwardX = Math.sin(p.playerFacingAngle);
    const pForwardZ = Math.cos(p.playerFacingAngle);
    const aiInFrontOfPlayerDot = pForwardX * -dirX + pForwardZ * -dirZ;
    const isOnFlankOrBack = aiInFrontOfPlayerDot < 0.3;

    const standingObs = this.findStandingObstacle(p.aiPos, p.obstacles);
    const isOnHighPerch = Boolean(standingObs && standingObs.height >= 1.05);

    const sniperIdealRange = Math.min(
      14.5,
      Math.max(10.0, this.personality.preferredRange),
    );
    const sniperDangerDist = 4.6;
    const sniperMinDist = 7.4;

    let perchPlan: { perch: ArenaObstacle; nextStep: ArenaObstacle } | null = null;
    if (p.aiWeapon.isRanged) {
      if (this.perchReevalTimer <= 0 || !this.targetPerchId) {
        perchPlan = this.planSniperPerch(
          p.aiPos,
          p.playerPos,
          p.obstacles,
          standingObs,
          p.aiWeapon.range,
        );
        this.targetPerchId = perchPlan?.perch.id ?? null;
        this.perchReevalTimer = 1.15;
      } else {
        perchPlan = this.planSniperPerch(
          p.aiPos,
          p.playerPos,
          p.obstacles,
          standingObs,
          p.aiWeapon.range,
        );
        if (perchPlan) {
          this.targetPerchId = perchPlan.perch.id ?? null;
        }
      }
    }

    const wantToClimbStep =
      p.aiWeapon.isRanged &&
      perchPlan !== null &&
      dist >= sniperDangerDist &&
      (!standingObs || perchPlan.perch.height > standingObs.height + 0.45) &&
      perchPlan.nextStep.height - p.aiPos.y > 0.35 &&
      perchPlan.nextStep.height - p.aiPos.y <= 2.28
        ? perchPlan.nextStep
        : null;

    // Handle post-attack pacing for both Ranged and Melee
    if (justCommittedAttack) {
      if (p.aiWeapon.isRanged) {
        const cadenceBase = 1.3 + (1 - this.personality.aggression) * 0.85;
        this.rangedShotCooldown = cadenceBase + Math.random() * 0.55;
        this.aimHoldTimer = 0;
        this.repositionTimer = isOnHighPerch
          ? 0.45 + Math.random() * 0.35
          : 0.75 + Math.random() * 0.55;
        if (Math.random() < 0.65) {
          this.flankSign *= -1;
        }
        if (dist < sniperMinDist && Math.random() < 0.62) {
          this.currentState = 'RETREAT';
          this.stateHoldTimer = 0.52;
        } else {
          this.currentState = isOnHighPerch ? 'SNIPE' : 'FLANK';
          this.stateHoldTimer = this.repositionTimer;
        }
      } else {
        this.currentExchangeHits += 1;
        if (p.playerIsGuarding && !isOnFlankOrBack) {
          this.blockedFrontHits += 1;
        } else {
          this.blockedFrontHits = 0;
        }

        const isHeavy = p.aiWeapon.kind === 'hammer';
        if (
          this.currentExchangeHits >= this.exchangeBudget ||
          this.blockedFrontHits >= 1
        ) {
          const basePause =
            (isHeavy ? 1.25 : 0.92) + (1 - this.personality.aggression) * 0.65;
          this.meleePauseTimer = Math.max(
            this.meleePauseTimer,
            p.aiAttackCooldown + basePause + Math.random() * 0.48,
          );
          this.currentExchangeHits = 0;
          this.exchangeBudget = this.rollExchangeBudget();

          const roll = Math.random();
          if (this.blockedFrontHits >= 1 || roll < 0.55 + this.personality.flankBias * 0.25) {
            this.currentState = 'FLANK';
            this.flankHoldTimer = 0.95 + Math.random() * 0.55;
            this.stateHoldTimer = this.flankHoldTimer;
            if (Math.random() < 0.55) this.flankSign *= -1;
          } else {
            this.currentState = 'RETREAT';
            this.retreatTimer = 1.05 + Math.random() * 0.5;
            this.stateHoldTimer = this.retreatTimer * 0.85;
          }
          this.blockedFrontHits = 0;
        } else {
          // Enforce a readable pause between individual swings inside a combo too!
          const interSwingPause =
            (isHeavy ? 0.35 : 0.18) + (1 - this.personality.aggression) * 0.2;
          this.meleePauseTimer = Math.max(
            this.meleePauseTimer,
            p.aiAttackCooldown + interSwingPause,
          );
        }
      }
    }

    if (p.aiWeapon.isRanged) {
      if (los && this.rangedShotCooldown <= 0 && (isOnHighPerch || this.repositionTimer <= 0)) {
        this.aimHoldTimer += dt;
      } else {
        this.aimHoldTimer = Math.max(0, this.aimHoldTimer - dt * 1.5);
      }
      if (p.playerIsGuarding) {
        this.guardWaitTimer += dt;
      } else {
        this.guardWaitTimer = 0;
      }
    }

    const playerLookingAtAi = aiInFrontOfPlayerDot > 0.55;
    const immediateMeleeThreat =
      p.playerIsAttacking &&
      p.playerAttackPhase === 'windup' &&
      dist < (p.aiWeapon.isRanged ? 6.5 : 4.5) &&
      playerLookingAtAi;
    const immediateRangedThreat =
      p.playerIsAttacking &&
      p.playerWeaponIsRanged &&
      dist < 22 &&
      playerLookingAtAi;

    const heavyIncomingPressure = this.recentDamageTaken > p.aiMaxHp * 0.14;

    let wantAttack = false;
    let wantGuard = this.guardHoldTimer > 0;
    let wantDash = false;
    let wantSpecial = false;

    const whiffOpening =
      !p.aiWeapon.isRanged &&
      (playerEnteredRecover || (p.playerAttackPhase === 'recover' && !isOnFlankOrBack)) &&
      dist < p.aiWeapon.range + 2.2 &&
      this.meleePauseTimer <= 0.16 &&
      Math.random() < 0.38 + this.personality.aggression * 0.38;

    if (whiffOpening && !p.aiIsStunned && p.aiAttackCooldown <= 0) {
      this.meleePauseTimer = 0;
      this.flankHoldTimer = 0;
      this.currentState = 'COMBO';
      this.stateHoldTimer = 0.45;
      if (dist > p.aiWeapon.range * 1.05 && energyRatio > 0.3 && this.dashCooldown <= 0) {
        wantDash = true;
        this.dashCooldown = 1.1;
      }
    }

    if (this.decisionTimer <= 0 && !p.aiIsStunned) {
      this.decisionTimer =
        this.personality.reactionTime * (0.85 + Math.random() * 0.32);

      if (
        p.aiSpecial >= 99.9 &&
        los &&
        (!p.playerIsGuarding || isOnFlankOrBack) &&
        dist <= (p.aiWeapon.isRanged ? Math.min(26.0, p.aiWeapon.range) : p.aiWeapon.range + 2.4) &&
        Math.random() < 0.78
      ) {
        this.currentState = 'SPECIAL';
        this.stateHoldTimer = 0.6;
        wantSpecial = true;
      } else if (
        (immediateMeleeThreat || immediateRangedThreat) &&
        this.stateHoldTimer <= 0.08
      ) {
        const aiCanGuard = p.aiCanGuard !== false;
        const canDash =
          energyRatio > (p.aiWeapon.isRanged ? 0.34 : 0.2) && this.dashCooldown <= 0;
        const roll = Math.random();
        const preferEvade = p.aiWeapon.isRanged
          ? this.personality.evadeSkill * 0.62
          : this.personality.evadeSkill * (aiCanGuard ? 0.62 : 0.9);
        if ((roll < preferEvade || !aiCanGuard) && canDash) {
          this.currentState = 'EVADE';
          this.stateHoldTimer = 0.38;
          this.dashCooldown = p.aiWeapon.isRanged ? 1.95 : aiCanGuard ? 1.05 : 1.45;
          wantDash = true;
        } else if (aiCanGuard && roll < preferEvade + this.personality.parryChance) {
          this.currentState = 'GUARD';
          this.guardHoldTimer = 0.52;
          this.stateHoldTimer = 0.42;
          wantGuard = true;
        } else if (p.aiWeapon.isRanged && dist < sniperDangerDist) {
          this.currentState = 'FLANK';
          this.stateHoldTimer = 0.55;
        }
      } else if (
        p.aiWeapon.isRanged &&
        dist < sniperDangerDist
      ) {
        this.currentState = 'RETREAT';
        this.retreatTimer = Math.max(this.retreatTimer, 0.58);
        this.stateHoldTimer = 0.48;
        if (
          dist < 4.2 &&
          energyRatio > 0.36 &&
          this.dashCooldown <= 0 &&
          Math.random() < 0.48
        ) {
          wantDash = true;
          this.dashCooldown = 2.1;
        }
      } else if (
        (energyRatio < 0.22 ||
          (hpRatio < 0.5 && energyRatio < 0.55 && this.personality.caution > 0.4) ||
          (heavyIncomingPressure && this.personality.caution > 0.35)) &&
        this.retreatTimer <= 0
      ) {
        this.recentDamageTaken = 0;
        this.currentState = 'RETREAT';
        this.retreatTimer = p.aiWeapon.isRanged
          ? 0.68 + Math.random() * 0.35
          : 1.15 + Math.random() * 0.55;
        this.stateHoldTimer = p.aiWeapon.isRanged ? 0.58 : 0.9;
        if (
          dist < (p.aiWeapon.isRanged ? 4.5 : 6.2) &&
          energyRatio > (p.aiWeapon.isRanged ? 0.32 : 0.18) &&
          this.dashCooldown <= 0
        ) {
          wantDash = true;
          this.dashCooldown = p.aiWeapon.isRanged ? 2.0 : 1.15;
        }
      } else if (this.stateHoldTimer <= 0) {
        if (p.aiWeapon.isRanged) {
          if (dist < sniperMinDist && Math.random() < 0.58) {
            this.currentState = 'RETREAT';
            this.stateHoldTimer = 0.5;
          } else if (wantToClimbStep && dist >= sniperDangerDist) {
            this.currentState = 'FLANK';
            this.stateHoldTimer = 0.55;
          } else if (!los) {
            this.flankSign = this.pickOpenFlankSign(
              p.aiPos,
              p.playerPos,
              dirX,
              dirZ,
              p.obstacles,
            );
            this.currentState = 'FLANK';
            this.stateHoldTimer = 0.62;
          } else if (isOnHighPerch && dist <= p.aiWeapon.range) {
            this.currentState = 'SNIPE';
            this.stateHoldTimer = 0.65;
          } else if (
            this.repositionTimer > 0 ||
            this.rangedShotCooldown > 0.45 ||
            p.playerIsGuarding
          ) {
            this.currentState = 'FLANK';
            this.stateHoldTimer = 0.55;
          } else if (dist <= p.aiWeapon.range) {
            this.currentState = 'SNIPE';
            this.stateHoldTimer = 0.62;
          } else {
            this.currentState = 'APPROACH';
            this.stateHoldTimer = 0.48;
          }
        } else {
          const inStrikeRange = dist <= p.aiWeapon.range * 0.94;
          const canCommitStrike =
            this.meleePauseTimer <= 0 &&
            this.flankHoldTimer <= 0 &&
            (!p.playerIsGuarding || isOnFlankOrBack || Math.random() < 0.22);

          if (inStrikeRange && los && canCommitStrike) {
            this.currentState = 'COMBO';
            this.stateHoldTimer = 0.42;
          } else if (
            inStrikeRange &&
            (this.meleePauseTimer > 0 || (p.playerIsGuarding && !isOnFlankOrBack))
          ) {
            if (
              !isOnFlankOrBack &&
              Math.random() < 0.42 + this.personality.flankBias * 0.45
            ) {
              this.currentState = 'FLANK';
              this.flankHoldTimer = 0.58 + Math.random() * 0.45;
              this.stateHoldTimer = this.flankHoldTimer;
            } else {
              this.currentState = 'RETREAT';
              this.retreatTimer = 0.75 + Math.random() * 0.45;
              this.stateHoldTimer = 0.68;
            }
          } else if (
            dist > p.aiWeapon.range * 1.55 &&
            energyRatio > 0.5 &&
            this.meleePauseTimer <= 0 &&
            Math.random() < this.personality.aggression * 0.55 &&
            this.dashCooldown <= 0
          ) {
            this.currentState = 'APPROACH';
            this.stateHoldTimer = 0.48;
            wantDash = true;
            this.dashCooldown = 1.35;
          } else if (
            dist < 7.8 &&
            (this.meleePauseTimer > 0 || Math.random() < this.personality.flankBias * 0.74)
          ) {
            this.currentState = 'FLANK';
            this.flankHoldTimer = Math.max(this.flankHoldTimer, 0.5 + Math.random() * 0.5);
            this.stateHoldTimer = 0.62;
          } else {
            this.currentState = 'APPROACH';
            this.stateHoldTimer = 0.48;
          }
        }
      }
    }

    _perp.set(-dirZ * this.flankSign, 0, dirX * this.flankSign);
    _steer.set(0, 0, 0);

    const weave = Math.sin(this.aiClock * 1.9);
    const sniperWindowReady =
      p.aiWeapon.isRanged &&
      los &&
      dist <= p.aiWeapon.range &&
      p.aiAttackCooldown <= 0 &&
      this.rangedShotCooldown <= 0 &&
      (playerDroppedGuard ||
        p.playerAttackPhase === 'windup' ||
        p.playerAttackPhase === 'recover' ||
        (!p.playerIsGuarding && this.aimHoldTimer >= 0.34) ||
        (p.playerIsGuarding && this.guardWaitTimer >= 1.55));

    const meleeReadyToSwing =
      !p.aiWeapon.isRanged &&
      los &&
      dist <= p.aiWeapon.range * 0.94 &&
      p.aiAttackCooldown <= 0 &&
      this.meleePauseTimer <= 0;

    switch (this.currentState) {
      case 'APPROACH': {
        if (p.aiWeapon.isRanged && dist < sniperIdealRange - 2.2) {
          _steer.set(-dirX * 0.35, 0, -dirZ * 0.35);
          _steer.addScaledVector(_perp, 0.82 + weave * 0.2);
        } else {
          _steer.set(dirX, 0, dirZ);
          const lateralFactor = p.playerWeaponIsRanged
            ? 0.55 + 0.38 * weave
            : (0.42 + 0.25 * weave) * this.personality.flankBias;
          _steer.addScaledVector(_perp, lateralFactor);
        }
        if (meleeReadyToSwing && (isOnFlankOrBack || !p.playerIsGuarding)) {
          wantAttack = true;
        }
        break;
      }
      case 'FLANK': {
        const flankDist = p.aiWeapon.isRanged
          ? sniperIdealRange
          : Math.max(2.35, this.personality.preferredRange * 0.95);
        const rangeDelta = dist - flankDist;
        const radialWeight = THREE.MathUtils.clamp(
          rangeDelta * 0.46 + weave * 0.18,
          p.aiWeapon.isRanged ? -0.92 : -0.68,
          p.aiWeapon.isRanged ? 0.55 : 0.75,
        );
        _steer.set(dirX * radialWeight, 0, dirZ * radialWeight);
        _steer.addScaledVector(_perp, p.aiWeapon.isRanged ? 0.85 : 1.05);

        if (p.readyInteractables.length > 0 && (hpRatio < 0.8 || energyRatio < 0.65)) {
          for (let i = 0; i < p.readyInteractables.length; i++) {
            const pad = p.readyInteractables[i];
            const pd = Math.hypot(pad.x - p.aiPos.x, pad.z - p.aiPos.z);
            const padToPlayer = Math.hypot(pad.x - p.playerPos.x, pad.z - p.playerPos.z);
            if (pd < 6.8 && pd > 0.1 && (!p.aiWeapon.isRanged || padToPlayer >= 10.0)) {
              _steer.x += ((pad.x - p.aiPos.x) / pd) * 0.6;
              _steer.z += ((pad.z - p.aiPos.z) / pd) * 0.6;
              break;
            }
          }
        }

        if (meleeReadyToSwing && (isOnFlankOrBack || this.flankHoldTimer <= 0)) {
          wantAttack = true;
        } else if (sniperWindowReady && (isOnHighPerch || this.repositionTimer <= 0.15)) {
          wantAttack = true;
        }
        break;
      }
      case 'COMBO': {
        if (dist > p.aiWeapon.range * 0.82) {
          _steer.set(dirX * 0.72, 0, dirZ * 0.72);
        } else {
          _steer.addScaledVector(_perp, 0.38);
        }
        if (
          meleeReadyToSwing &&
          this.currentExchangeHits < this.exchangeBudget &&
          (p.aiComboStep === 0 || Math.random() < this.personality.comboCommit)
        ) {
          wantAttack = true;
        }
        break;
      }
      case 'SNIPE': {
        if (isOnHighPerch && standingObs) {
          // Perched on rock plateau: micro-strafe without walking off ledge!
          _steer.addScaledVector(_perp, 0.42 * weave);
        } else if (dist < sniperIdealRange - 2.6) {
          _steer.set(-dirX * 0.35, 0, -dirZ * 0.35);
          _steer.addScaledVector(_perp, 0.78);
        } else if (dist > sniperIdealRange + 3.0) {
          _steer.set(dirX * 0.55, 0, dirZ * 0.55);
          _steer.addScaledVector(_perp, 0.34);
        } else {
          _steer.addScaledVector(_perp, 0.42 + weave * 0.24);
        }

        // Shoulder sniper rifle in ADS stance right before firing
        if (
          p.aiCanGuard === false &&
          p.aiWeapon.isRanged &&
          los &&
          dist >= sniperDangerDist &&
          this.rangedShotCooldown <= 0.58 &&
          !p.aiIsStunned
        ) {
          wantGuard = true;
        }
        if (sniperWindowReady) {
          wantAttack = true;
        }
        break;
      }
      case 'GUARD': {
        wantGuard = true;
        _steer.addScaledVector(_perp, 0.38);
        break;
      }
      case 'EVADE': {
        _steer.copy(_perp);
        if (dist < (p.aiWeapon.isRanged ? 6.0 : 4.4)) {
          const backPush = p.aiWeapon.isRanged ? 0.28 : 0.72;
          _steer.x -= dirX * backPush;
          _steer.z -= dirZ * backPush;
        }
        break;
      }
      case 'RETREAT': {
        let soughtObjective = false;
        if (p.readyInteractables.length > 0 && (hpRatio < 0.76 || energyRatio < 0.52)) {
          let bestNode: ArenaInteractable | null = null;
          let bestScore = Infinity;
          for (let i = 0; i < p.readyInteractables.length; i++) {
            const node = p.readyInteractables[i];
            const nodePlayerDist = Math.hypot(node.x - p.playerPos.x, node.z - p.playerPos.z);
            if (p.aiWeapon.isRanged && nodePlayerDist < 10.5) continue;
            if (node.kind === 'repair_node' && hpRatio < 0.78) {
              const nd = Math.hypot(node.x - p.aiPos.x, node.z - p.aiPos.z);
              if (nd < bestScore) {
                bestScore = nd;
                bestNode = node;
              }
            } else if (node.kind === 'boost_pad' && energyRatio < 0.55) {
              const nd = Math.hypot(node.x - p.aiPos.x, node.z - p.aiPos.z);
              if (nd < bestScore) {
                bestScore = nd;
                bestNode = node;
              }
            }
          }
          if (bestNode && bestScore < 15) {
            const ndx = bestNode.x - p.aiPos.x;
            const ndz = bestNode.z - p.aiPos.z;
            const nLen = Math.max(0.01, Math.hypot(ndx, ndz));
            _steer.set(ndx / nLen, 0, ndz / nLen);
            soughtObjective = true;
          }
        }

        if (
          !soughtObjective &&
          p.aiWeapon.isRanged &&
          perchPlan &&
          Math.hypot(perchPlan.perch.x - p.playerPos.x, perchPlan.perch.z - p.playerPos.z) > 13.0 &&
          dist >= 7.5
        ) {
          const pdx = perchPlan.nextStep.x - p.aiPos.x;
          const pdz = perchPlan.nextStep.z - p.aiPos.z;
          const pLen = Math.hypot(pdx, pdz);
          if (pLen > 0.4) {
            _steer.set(pdx / pLen, 0, pdz / pLen);
            soughtObjective = true;
          }
        }

        if (!soughtObjective && (p.aiWeapon.isRanged || p.playerWeaponIsRanged) && dist >= 8.5) {
          const cover = this.findNearestCoverSpot(p.aiPos, p.playerPos, p.obstacles);
          if (cover) {
            const cPlayerDist = Math.hypot(cover.x - p.playerPos.x, cover.z - p.playerPos.z);
            if (!p.aiWeapon.isRanged || cPlayerDist > dist) {
              const cdx = cover.x - p.aiPos.x;
              const cdz = cover.z - p.aiPos.z;
              const cDist = Math.hypot(cdx, cdz);
              if (cDist > 0.7) {
                _steer.set(cdx / cDist, 0, cdz / cDist);
                soughtObjective = true;
              }
            }
          }
        }

        if (!soughtObjective) {
          const backBias = p.aiWeapon.isRanged ? 0.48 : 0.85;
          _steer.set(-dirX * backBias, 0, -dirZ * backBias);
          _steer.addScaledVector(_perp, (p.aiWeapon.isRanged ? 0.82 : 0.55) + weave * 0.2);
        }

        if (
          p.aiCanGuard !== false &&
          !p.aiWeapon.isRanged &&
          dist < 4.8 &&
          playerLookingAtAi &&
          this.personality.caution > 0.45 &&
          p.playerIsAttacking
        ) {
          wantGuard = true;
        }
        if (sniperWindowReady && dist > 4.2) {
          wantAttack = true;
        }
        break;
      }
      case 'SPECIAL': {
        _steer.set(p.aiWeapon.isRanged ? -dirX * 0.3 : dirX * 0.35, 0, p.aiWeapon.isRanged ? -dirZ * 0.3 : dirZ * 0.35);
        break;
      }
    }

    // Hunter rock-perch steering & climbing vs holding plateau bounds
    let wantJump = false;
    const activeClimbTarget =
      p.aiWeapon.isRanged &&
      this.currentState !== 'EVADE' &&
      this.currentState !== 'SPECIAL' &&
      dist >= sniperDangerDist
        ? wantToClimbStep
        : null;

    if (activeClimbTarget) {
      const cdx = activeClimbTarget.x - p.aiPos.x;
      const cdz = activeClimbTarget.z - p.aiPos.z;
      const cDist = Math.hypot(cdx, cdz);
      if (cDist > 0.05) {
        const climbWeight = p.aiIsGrounded === false ? 2.4 : 1.55;
        _steer.x = _steer.x * 0.25 + (cdx / cDist) * climbWeight;
        _steer.z = _steer.z * 0.25 + (cdz / cDist) * climbWeight;
      }
      const climbDelta = activeClimbTarget.height - p.aiPos.y;
      if (
        cDist <= activeClimbTarget.radius + 1.58 &&
        climbDelta > 0.35 &&
        climbDelta <= 2.3 &&
        p.aiIsGrounded !== false &&
        this.climbJumpCooldown <= 0
      ) {
        wantJump = true;
        this.climbJumpCooldown = 0.52;
      }
    } else if (
      p.aiWeapon.isRanged &&
      isOnHighPerch &&
      standingObs &&
      dist >= sniperDangerDist &&
      this.currentState !== 'RETREAT' &&
      this.currentState !== 'EVADE'
    ) {
      // Keep Hunter safely centered/balanced on rock plateau while sniping
      const rdx = p.aiPos.x - standingObs.x;
      const rdz = p.aiPos.z - standingObs.z;
      const rDist = Math.hypot(rdx, rdz);
      const safeCap = Math.max(0.45, standingObs.radius * 0.56);
      if (rDist > safeCap && rDist > 0.001) {
        const pull = (rDist - safeCap) * 2.8;
        _steer.x -= (rdx / rDist) * pull;
        _steer.z -= (rdz / rDist) * pull;
      }
    }

    // Smooth obstacle & arena boundary avoidance + jumping up climbable ledges
    for (let i = 0; i < p.obstacles.length; i++) {
      const obs = p.obstacles[i];
      if (p.aiPos.y >= obs.height - 0.42) continue;
      if (activeClimbTarget && obs === activeClimbTarget) continue;

      _obsVec.set(p.aiPos.x - obs.x, 0, p.aiPos.z - obs.z);
      const od = _obsVec.length();
      const safeDist = obs.radius + 1.45;
      if (od < safeDist && od > 0.001) {
        const climbDelta = obs.height - p.aiPos.y;
        const playerAbove = p.playerPos.y > p.aiPos.y + 0.75;
        if (
          climbDelta > 0.4 &&
          climbDelta <= 2.15 &&
          (playerAbove || (!p.aiWeapon.isRanged && this.currentState === 'APPROACH')) &&
          this.climbJumpCooldown <= 0
        ) {
          wantJump = true;
          this.climbJumpCooldown = 0.52;
        }
        const push = (safeDist - od) / safeDist;
        _obsVec.divideScalar(od);
        _steer.x += (_obsVec.x + -_obsVec.z * this.flankSign * 0.65) * push * 2.2;
        _steer.z += (_obsVec.z + _obsVec.x * this.flankSign * 0.65) * push * 2.2;
      }
    }

    const posLen = Math.hypot(p.aiPos.x, p.aiPos.z);
    if (posLen > p.arenaRadius - 2.0) {
      const wallPush = (posLen - (p.arenaRadius - 2.0)) * 1.4;
      _steer.x -= (p.aiPos.x / posLen) * wallPush;
      _steer.z -= (p.aiPos.z / posLen) * wallPush;
    }

    const steerLen = _steer.length();
    if (steerLen > 0.001) {
      _steer.divideScalar(steerLen);
    }

    return {
      moveDirX: _steer.x,
      moveDirZ: _steer.z,
      aimAngle,
      wantAttack,
      wantGuard,
      wantDash,
      wantSpecial,
      wantJump,
      tacticalState: this.currentState,
    };
  }
}
