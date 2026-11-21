(function (root) {
  "use strict";

  const RIGHT = 1;
  const LEFT = 2;
  const DOWN = 4;
  const UP = 8;
  const HAMMER = 16;

  // 通常壁・鉄柱の共通崩壊フレーム基準 ($B0F1 + $AB6F: stage 5->4->3->2->1->0)
  const COLLAPSE_STAGE_FRAMES = 8;
  const COLLAPSE_TOTAL_FRAMES = 1 + COLLAPSE_STAGE_FRAMES * 4; // 33F
  const COLLAPSE_HIT_FRAMES = 1 + COLLAPSE_STAGE_FRAMES * 3;   // 25F (stage >= 2)

  const TILE = {
    EMPTY: 0x00,
    LADDER: 0x01,
    DOOR_OPEN: 0x04,       // ドア全開（敵入出可・ダウン判定なし）
    DOOR_CLOSING_1: 0x05,  // ドア閉じかけ1
    DOOR_CLOSING_2: 0x07,  // ドア閉じかけ2
    WALL: 0x08,            // 互換エイリアス（ドラム缶）
    DRUM: 0x08,            // ドラム缶（横通行不可・上乗れる・壊せない）
    HOLE: 0x09,
    HOLE_CRUMBLED: 0x0a,   // 壊せるはしご崩落穴
    HOLE_PILLAR_LAD: 0x0b, // 連続はしご落下後の穴
    HOLE_FALLING: 0x0c,    // 鉄柱で上段が落ち始めた瞬間の滞空穴（0〜41F）
    DRUM_FALLING: 0x0d,    // ドラム缶落下中の下段（30〜41F）
    CRUMBLING_1: 0x51,     // 壊れかけはしご（残1）
    CRUMBLING_2: 0x52,     // 壊れかけはしご（残2）
    CRUMBLING_3: 0x53,     // 壊れかけはしご（残3）
    CRUMBLING_4: 0x54,     // 壊れかけはしご（残4）
    DOOR_OPENING_2: 0x62,  // ドア開き始め2（マリオ叩き、ダウン判定あり）
    DOOR_OPENING_1: 0x63,  // ドア開き始め1（マリオ叩き、ダウン判定あり）
    WALL_1: 0xc1,          // 1回壊せる壁
    WALL_2: 0x92,          // 2回壊せる壁
    WALL_3: 0xa3,          // 3回壊せる壁
    BOMB: 0xb1,            // 爆弾
    BREAK_LADDER: 0xd1,    // 壊せるはしご
    DOOR: 0xe1,            // ドア（閉：叩ける・素通り可・破壊ターゲット外）
    PILLAR: 0xf1           // 支柱（鉄柱）
  };

  function isBreakableTile(t) {
    return (t & 0x80) !== 0;
  }

  function isClearTargetTile(t) {
    if ((t & 0x80) === 0) return false;
    if (t === TILE.BOMB || t === TILE.PILLAR) return false;
    if ((t & 0xf0) === 0xe0) return false;
    return true;
  }

  function isLadderTile(t) {
    return t === TILE.LADDER || t === TILE.BREAK_LADDER;
  }

  function isCrumblingLadderTile(t) {
    return t >= 0x51 && t <= 0x55;
  }

  function isPillarCrumblingTile(t) {
    return t >= 0x71 && t <= 0x75;
  }

  function isDoorOpeningTile(t) {
    return (t & 0x80) === 0 && (t & 0x70) === 0x60 && (t & 0x07) >= 2;
  }

  function isDoorRelatedTile(t) {
    return t === TILE.DOOR_OPEN ||
      t === TILE.DOOR_CLOSING_1 ||
      t === TILE.DOOR_CLOSING_2 ||
      (t & 0x70) === 0x60;
  }

  function isSameLadderType(t1, t2) {
    return (t1 === TILE.LADDER && t2 === TILE.LADDER) ||
      (t1 === TILE.BREAK_LADDER && t2 === TILE.BREAK_LADDER);
  }

  function isHoleTile(t) {
    return t >= 0x09 && t <= 0x0b;
  }

  function isFallHoleTile(t) {
    return t >= 0x09 && t <= 0x0c;
  }

  function isSolidDrum(t) {
    return t === TILE.DRUM;
  }

  function getPillarFallPayload(aboveTile) {
    if (aboveTile === TILE.EMPTY) return TILE.EMPTY;
    if (aboveTile === TILE.LADDER || aboveTile === TILE.BREAK_LADDER || aboveTile === TILE.DRUM) {
      return aboveTile;
    }
    if (aboveTile === TILE.BOMB ||
        aboveTile === TILE.WALL_1 ||
        aboveTile === TILE.WALL_2 || aboveTile === 0x91 ||
        aboveTile === TILE.WALL_3 || aboveTile === 0xa2 || aboveTile === 0xa1) {
      return aboveTile;
    }
    if (aboveTile >= 0x10 && aboveTile <= 0x5f) {
      return TILE.EMPTY;
    }
    return null;
  }

  function getHammerTiming(slot) {
    if (slot.isMario) {
      return slot.isGolden
        ? { totalFrames: 7, hitFrame: 5, recoverStart: 7 }
        : { totalFrames: 21, hitFrame: 17, recoverStart: 21 };
    }
    return { totalFrames: 27, hitFrame: 14, recoverStart: 23 };
  }

  // State 5 落下速度テーブル（前半=Mario用, 後半$12〜=Spike用）
  const FALL_TABLE = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 2, 2, 3, -1,
    0, 1, 0, 1, 1, 2, 1, 2, 2, 2, 3, 2, 3, -1
  ];

  // State 10 被弾跳ねY差分テーブル（上へ-10px跳ねて戻り、以降は毎F+2落下）
  const KNOCKDOWN_DY = [
    -2, -2, -1, -2, -1, -1, 0, -1, 0, 0,
     0,  0,  1,  0,  1,  2, 1,  1, 2, 1, 1
  ];

  function relYOfProm(prom) {
    if (prom <= 4) return 31;
    if (prom <= 9) return 27;
    if (prom <= 14) return 23;
    if (prom <= 19) return 19;
    if (prom <= 24) return 15;
    return 11;
  }

  class Actor {
    constructor(isMario) {
      this.isMario = isMario;
      this.state = 0;
      this.aux = 0;      // State 8 カウンタ / State 9 目標列
      this.auxRow = 0;   // State 9 目標行
      this.bits = 0;
      this.x = 80;
      this.y = 64;
      this.dir = 4;
      this.facing = RIGHT;
      this.topY = 32;    // State 2/3/6:上端Y, State 5:前Y
      this.avail = 0;
      this.row = 1;
      this.col = 5;
      this.flag = 0;     // bit1 = ドラム缶頭上
      this.n = 0;        // 境界ステート経過F / State 10 カウンタ
      this.kind = null;
      this.prom = 0;
      this.hammerTimer = 0;
      this.hammerHitDone = false;
      this.isGolden = false;
      this.prevHammer = false;
      this.stunTimer = 0;
    }
  }

  class ActorStepper {
    getActorSide(slot) {
      if (slot.isMario) return 0;
      if (!slot.isEnemy) return 1;
      return slot.isBack ? 1 : 0;
    }

    updateCR(slot, world) {
      const wx = world.wrapX(slot.x + 8);
      slot.col = Math.floor(wx / 16);
      const rawRow = Math.floor((slot.y - 32) / 32);
      slot.row = Math.max(0, Math.min(world.rows - 1, rawRow));
    }

    snapY(slot) {
      slot.y = Math.floor((slot.y + 8) / 32) * 32;
      slot.flag &= ~0x02;
    }

    snapX(slot, world) {
      slot.x = world.wrapCol(Math.floor(world.wrapX(slot.x + 8) / 16)) * 16;
    }

    isContinuousLadder(row, col, world) {
      return row >= 0 &&
        row < world.rows - 1 &&
        isSameLadderType(world.getTile(row, col), world.getTile(row + 1, col));
    }

    isContinuousLadderSegment(row, col, world) {
      if (row < 0 || row >= world.rows - 1) return false;
      const t = world.getTile(row, col);
      const b = world.getTile(row + 1, col);
      if (isSameLadderType(t, b)) return true;
      if (t === TILE.BREAK_LADDER && isCrumblingLadderTile(b)) return true;
      if (isCrumblingLadderTile(t) && world.hasCrumblingBelowSame(row, col)) return true;
      return false;
    }

    snapIfContLadderIdle(slot, world) {
      if (this.isContinuousLadder(slot.row, slot.col, world)) {
        this.snapX(slot, world);
      }
    }

    enterKnockdown(slot) {
      slot.state = 10;
      slot.n = 0;
      slot.kind = null;
      slot.prom = 0;
      slot.aux = 0;
      slot.auxRow = 0;
      slot.flag &= ~0x02;
      slot.hammerTimer = 0;
      slot.hammerHitDone = false;
      slot.stunTimer = 0;
    }

    // $C8BB 相当: 落下中ドラム缶 ($0D) による閉じ込め捕獲＆隣セルはみ出し押し戻し
    checkDrumTrap(slot, world) {
      if (slot.state !== 0 && slot.state !== 1 && slot.state !== 2 && slot.state !== 4) {
        return false;
      }
      const curTile = world.getTile(slot.row, slot.col);
      if (curTile === TILE.DRUM_FALLING) {
        if (slot.state === 2) {
          slot.prom = 0x10;
          return false;
        }
        slot.state = 15;
        slot.n = 0;
        slot.kind = null;
        slot.prom = 0;
        slot.aux = 0;
        slot.auxRow = 0;
        slot.hammerTimer = 0;
        slot.hammerHitDone = false;
        slot.stunTimer = 0;
        this.snapX(slot, world);
        this.snapY(slot);
        this.updateCR(slot, world);
        return true;
      }
      if ((slot.x & 0x0f) !== 0) {
        const sideCol = world.wrapCol(slot.col + ((slot.x & 0x0f) < 8 ? 1 : -1));
        if (world.getTile(slot.row, sideCol) === TILE.DRUM_FALLING) {
          this.snapX(slot, world);
          this.updateCR(slot, world);
        }
      }
      return false;
    }

    checkLadderHoldHazard(slot, world, ladderRow) {
      const t = world.getTile(ladderRow, slot.col);
      if (isLadderTile(t)) return false;
      if (isCrumblingLadderTile(t)) {
        const info = world.getCrumblingInfo(ladderRow, slot.col);
        const stage = info ? info.stage : (t & 0x07);
        const sameSide = (info ? info.byMario : true) === slot.isMario;
        if (!sameSide || stage <= 2) {
          this.enterKnockdown(slot);
          return true;
        }
        return false;
      }
      this.enterKnockdown(slot);
      return true;
    }

    checkHazardHit(slot, world) {
      if (slot.state === 10 || slot.state === 11 || slot.state === 15 || slot.state === 16) {
        return false;
      }

      const isHoldingLadder = slot.state === 2 ||
        slot.state === 6 ||
        (slot.state === 3 && slot.kind !== "arrive" && slot.kind !== "arrive_top");
      const checkRow = isHoldingLadder
        ? Math.max(0, Math.min(world.rows - 1, Math.floor(slot.topY / 32)))
        : (slot.state === 5
          ? Math.max(0, Math.min(world.rows - 1, Math.floor((slot.y - 16) / 32)))
          : slot.row);

      if (world.explosions.length > 0) {
        for (let i = 0; i < world.explosions.length; i++) {
          const ex = world.explosions[i];
          if (ex.col !== slot.col || ex.row !== checkRow) continue;
          if (ex.kind === "bomb") {
            if (ex.age >= 21 || ex.byMario !== slot.isMario) {
              this.enterKnockdown(slot);
              return true;
            }
          } else if (ex.kind === "wall") {
            if (ex.age < COLLAPSE_HIT_FRAMES && ex.byMario !== slot.isMario) {
              this.enterKnockdown(slot);
              return true;
            }
          }
        }
      }

      if (!(slot.flag & 2)) {
        const checkTile = world.getTile(checkRow, slot.col);
        if (isDoorOpeningTile(checkTile)) {
          const attackerSide = (checkTile & 0x08) !== 0 ? 1 : 0;
          if (this.getActorSide(slot) !== attackerSide) {
            this.enterKnockdown(slot);
            return true;
          }
        }
      }

      if (world.pillarBreaks.size > 0 && !(slot.flag & 2)) {
        const pInfo = world.getPillarBreakInfo(checkRow, slot.col);
        if (pInfo && pInfo.stage >= 2 && pInfo.byMario !== slot.isMario) {
          this.enterKnockdown(slot);
          return true;
        }
      }

      if (world.crumblingLadders.size > 0 && !(slot.flag & 2)) {
        const onFloorState = slot.state === 0 ||
          slot.state === 1 ||
          slot.state === 4 ||
          slot.state === 8 ||
          slot.state === 9 ||
          (slot.state === 3 && (slot.kind === "arrive" || slot.kind === "arrive_top"));

        if (onFloorState) {
          const t = world.getTile(slot.row, slot.col);
          if (isCrumblingLadderTile(t)) {
            const info = world.getCrumblingInfo(slot.row, slot.col);
            const stage = info ? info.stage : (t & 0x07);
            const sameSide = (info ? info.byMario : true) === slot.isMario;
            if (!sameSide) {
              if (stage >= 2) {
                this.enterKnockdown(slot);
                return true;
              }
            } else if (stage <= 2 && slot.row < world.rows - 1 && info && info.hasBelowSame) {
              const belowTile = world.getTile(slot.row + 1, slot.col);
              const belowInfo = world.getCrumblingInfo(slot.row + 1, slot.col);
              const belowFalling = isHoleTile(belowTile) ||
                (belowInfo ? belowInfo.stage <= 2 : (isCrumblingLadderTile(belowTile) && (belowTile & 0x07) <= 2));
              if (belowFalling) {
                this.enterKnockdown(slot);
                return true;
              }
            }
          }
        }
      }

      return false;
    }

    canPassWall(slot, b, world) {
      if ((slot.x & 0x0f) !== 0) return true;
      const targetCol = world.wrapCol(slot.col + ((b & RIGHT) ? 1 : -1));
      const tile = world.getTile(slot.row, targetCol);
      if (slot.flag & 2) {
        if (isLadderTile(tile)) {
          return slot.row < world.rows - 1 &&
            isSameLadderType(tile, world.getTile(slot.row + 1, targetCol));
        }
        return isHoleTile(tile);
      }
      return !isSolidDrum(tile);
    }

    tryStartHammer(slot, b, world) {
      if ((b & HAMMER) === 0) return false;
      const curTile = world.getTile(slot.row, slot.col);
      if (isLadderTile(curTile) && slot.row < world.rows - 1) {
        const belowTile = world.getTile(slot.row + 1, slot.col);
        if (isSameLadderType(curTile, belowTile)) {
          return false;
        }
      }
      slot.state = 4;
      slot.hammerTimer = 0;
      slot.hammerHitDone = false;
      return true;
    }

    tryEnterHole(slot, world) {
      if (slot.row >= world.rows - 1) return false;
      if (slot.flag & 2) {
        if (isSolidDrum(world.getTile(slot.row + 1, slot.col))) return false;
      } else {
        if (!isFallHoleTile(world.getTile(slot.row, slot.col))) return false;
      }
      if (((slot.x + 3) & 0x0f) >= 6) return false;

      if (slot.isMario) {
        this.snapX(slot, world);
      }
      slot.prom = slot.isMario ? 0 : 0x12;
      slot.topY = slot.y;
      slot.state = 5;
      return true;
    }

    // 横飛び遷移 (State 8 / State 9)
    trySideTransition(slot, b, world) {
      this.updateCR(slot, world);
      const horiz = b & (LEFT | RIGHT);
      if (horiz === 0) return false;

      if (slot.state !== 1) {
        const curTile = world.getTile(slot.row, slot.col);
        if (!isLadderTile(curTile) && !isHoleTile(curTile)) return false;
        if (slot.row >= world.rows - 1) return false;
        const belowTile = world.getTile(slot.row + 1, slot.col);
        if (!isLadderTile(belowTile)) return false;
      }

      const dirStep = (horiz === RIGHT) ? 1 : -1;
      const nextCol = world.wrapCol(slot.col + dirStep);
      const nextTile = world.getTile(slot.row, nextCol);
      let goDirectlyToApply = false;

      if (slot.state !== 1 && isHoleTile(nextTile)) {
        if ((slot.y & 0x1f) >= 0x0b &&
            slot.row < world.rows - 1 &&
            isSolidDrum(world.getTile(slot.row + 1, nextCol))) {
          if (slot.prom < 0x0f) return false;
          slot.y = Math.floor(slot.y / 32) * 32 + 0x0b;
        }
        if (slot.row < world.rows - 1) {
          const nextBelow = world.getTile(slot.row + 1, nextCol);
          if (isLadderTile(nextBelow) && (slot.y & 0x0f) !== 0 && slot.prom < 0x1f) {
            goDirectlyToApply = true;
          }
        }
        if (!goDirectlyToApply) {
          const prevState = slot.state;
          slot.state = 8;
          if (prevState === 2) {
            slot.aux = 0x0c;
          }
          slot.dir = horiz;
          slot.facing = horiz;
          return true;
        }
      }

      if (!goDirectlyToApply) {
        if (!isLadderTile(nextTile)) return false;
        if (slot.row >= world.rows - 1) return false;
        const nextBelow = world.getTile(slot.row + 1, nextCol);
        if (!isSameLadderType(nextTile, nextBelow)) return false;

        const onContCur = this.isContinuousLadder(slot.row, slot.col, world);
        if (!onContCur && slot.state === 1) {
          const xMod = slot.x & 0x0f;
          if (horiz & RIGHT) {
            if (xMod !== 7) return false;
          } else {
            if (xMod !== 9) return false;
          }
        }

        if (slot.state === 1) {
          slot.prom = 0;
          slot.topY = slot.y - 32;
        }
      }

      slot.aux = nextCol;
      slot.auxRow = slot.row;
      if (slot.state === 2 && slot.topY === slot.y) {
        slot.y += 8;
      }
      slot.state = 9;
      slot.dir = horiz;
      slot.facing = horiz;
      return true;
    }

    tryEnterLadder(slot, b, world) {
      const curTile = world.getTile(slot.row, slot.col);
      if (isHoleTile(curTile)) return false;

      const canUp = isLadderTile(curTile);
      const canDown = slot.row < world.rows - 1 && isLadderTile(world.getTile(slot.row + 1, slot.col));
      let avail = (canUp ? 2 : 0) | (canDown ? 1 : 0);
      if (avail !== 0 && ((slot.x + 6) & 0x0f) >= 12) {
        avail = 0;
      }
      slot.avail = avail;

      if (avail === 0) return false;
      if ((b & (UP | DOWN)) === 0) return false;
      const matched = ((b & (UP | DOWN)) >> 2) & avail;
      if (matched === 0) return false;
      if (matched !== 1 && slot.row === 0) return false;

      slot.dir = b & (UP | DOWN);
      this.snapX(slot, world);
      if (matched === 1) {
        slot.topY = slot.y;
        slot.prom = 31;
        slot.state = 3;
        slot.kind = "enter_top";
        slot.n = 1;
      } else {
        slot.topY = slot.y - 32;
        slot.prom = 1;
        slot.state = 3;
        slot.kind = "enter";
        slot.n = 1;
      }

      if (this.isContinuousLadder(slot.row, slot.col, world)) {
        if (slot.dir === UP) {
          slot.state = 2;
          slot.kind = null;
          slot.n = 0;
        } else {
          slot.state = 6;
          slot.kind = "enter_top_cont";
          slot.n = 1;
        }
      }
      return true;
    }

    finishLadderSegment(slot, world, arriveKind) {
      this.updateCR(slot, world);
      if (this.isContinuousLadderSegment(slot.row, slot.col, world)) {
        if (slot.row === 0) {
          slot.state = 0;
          slot.kind = null;
          slot.n = 0;
          slot.avail = 0;
          return;
        }
        if (slot.dir & DOWN) {
          slot.topY = slot.y;
          slot.prom = 31;
        } else {
          slot.topY = slot.y - 32;
          slot.prom = 1;
        }
        slot.state = 6;
        slot.kind = "cont";
        slot.n = 1;
        slot.avail = (slot.row !== 0 ? 1 : 0) | (slot.row < world.rows - 1 ? 2 : 0);
        return;
      }
      if (slot.row < world.rows - 1 && isHoleTile(world.getTile(slot.row, slot.col))) {
        this.enterKnockdown(slot);
        return;
      }
      slot.state = 3;
      slot.kind = arriveKind;
      slot.n = 1;
      slot.avail = 0;
    }

    step(slot, world) {
      this.updateCR(slot, world);

      // State 15 ($0F): 落下中ドラム缶に捕獲され待機 → 着地($08)で State 16 へ
      if (slot.state === 15) {
        if (world.getTile(slot.row, slot.col) === TILE.DRUM) {
          slot.state = 16;
        }
        return;
      }

      // State 16 ($10): ドラム缶閉じ込めジタバタ状態（行動不能）
      if (slot.state === 16) {
        return;
      }

      if (slot.state === 10) {
        const dy = slot.n < KNOCKDOWN_DY.length ? KNOCKDOWN_DY[slot.n] : 2;
        slot.n += 1;
        slot.y += dy;

        const maxFloorY = world.rows * 32;
        const bottomRow = world.rows - 1;
        const bottomDrumY = bottomRow * 32 + 0x0b;
        const canCheckLanding = slot.n >= KNOCKDOWN_DY.length || dy > 0;

        if (canCheckLanding &&
            slot.y >= bottomDrumY &&
            isSolidDrum(world.getTile(bottomRow, slot.col))) {
          slot.y = bottomDrumY;
          slot.topY = bottomDrumY;
          slot.flag |= 2;
          slot.prom = 0;
          slot.n = 0;
          slot.state = 11;
          slot.stunTimer = 19;
          this.updateCR(slot, world);
          return;
        }

        if (canCheckLanding && slot.y >= maxFloorY) {
          slot.y = maxFloorY;
          slot.topY = maxFloorY;
          slot.flag &= ~0x02;
          slot.prom = 0;
          slot.n = 0;
          slot.state = 11;
          slot.stunTimer = 19;
          this.updateCR(slot, world);
          return;
        }
        slot.topY = slot.y;
        return;
      }

      if (slot.state === 11) {
        slot.stunTimer -= 1;
        if (slot.stunTimer <= 0) {
          slot.stunTimer = 0;
          slot.state = 0;
        }
        return;
      }

      if (this.checkHazardHit(slot, world)) return;
      if (this.checkDrumTrap(slot, world)) return;

      const b = slot.bits;

      if (slot.state === 0) {
        if (this.tryStartHammer(slot, b, world)) return;
        if (this.tryEnterLadder(slot, b, world)) return;
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          slot.facing = slot.dir;
          if ((slot.flag & 2) === 0) {
            this.snapY(slot);
          }
          if (!this.canPassWall(slot, b, world)) {
            this.snapIfContLadderIdle(slot, world);
            return;
          }
          slot.prom = 0;
          slot.state = 1;
          return;
        }
        this.snapIfContLadderIdle(slot, world);
      } else if (slot.state === 1) {
        if (this.tryStartHammer(slot, b, world)) return;
        if (this.tryEnterLadder(slot, b, world)) return;
        if (this.tryEnterHole(slot, world)) return;
        if (this.trySideTransition(slot, b, world)) return;
        if (!this.canPassWall(slot, b, world)) {
          slot.state = 0;
          slot.dir = (slot.dir + 1) & 0xff;
          return;
        }
        if ((b & (LEFT | RIGHT)) && (b & (LEFT | RIGHT)) === (slot.dir & (LEFT | RIGHT))) {
          const stepX = (slot.dir & LEFT) ? -1 : 1;
          slot.x = world.wrapX(slot.x + stepX);
        } else {
          slot.state = 0;
          slot.dir = (slot.dir + 1) & 0xff;
        }
      } else if (slot.state === 4) {
        const { totalFrames, hitFrame } = getHammerTiming(slot);
        slot.hammerTimer += 1;
        if (!slot.hammerHitDone && slot.hammerTimer >= hitFrame) {
          slot.hammerHitDone = true;
          world.hitCell(slot.row, slot.col, slot.isMario);
        }
        if (slot.hammerTimer >= totalFrames) {
          slot.state = 0;
          slot.hammerTimer = 0;
          slot.hammerHitDone = false;
        }
      } else if (slot.state === 3) {
        if (slot.kind !== "arrive" && slot.kind !== "arrive_top") {
          const ladderRow = Math.max(0, Math.min(world.rows - 1, Math.floor(slot.topY / 32)));
          if (this.checkLadderHoldHazard(slot, world, ladderRow)) return;
        }
        slot.n += 1;
        let limit = 6;
        if (slot.kind === "arrive_top") {
          limit = 12;
        } else if (slot.kind === "enter_top") {
          limit = slot.isMario ? 12 : 9;
        }
        if (slot.n >= limit) {
          slot.state = (slot.kind === "enter" || slot.kind === "enter_top") ? 2 : 0;
          slot.kind = null;
          slot.n = 0;
        }
      } else if (slot.state === 5) {
        this.snapX(slot, world);
        slot.prom += 1;
        let spd = FALL_TABLE[slot.prom];
        if (spd < 0) {
          slot.prom -= 1;
          spd = FALL_TABLE[slot.prom];
        }
        slot.y = slot.topY + spd;
        slot.topY = slot.y;

        // 最下段の床ガード
        const maxFloorY = world.rows * 32;
        if (slot.y >= maxFloorY) {
          slot.y = maxFloorY;
          slot.topY = maxFloorY;
          slot.flag &= ~0x02;
          slot.state = 0;
          slot.prom = 0;
          return;
        }

        if (((slot.y + 2) & 0x1f) < 4) {
          this.snapY(slot);
          this.updateCR(slot, world);
          const t = world.getTile(slot.row, slot.col);
          const isHole = isFallHoleTile(t) && (slot.row < world.rows - 1);
          const isContLad = this.isContinuousLadderSegment(slot.row, slot.col, world);
          if (!isHole && !isContLad) {
            slot.state = 0;
            slot.prom = 0;
            return;
          }
        }

        const yMod = slot.y & 0x1f;
        if (yMod >= 0x0b &&
            yMod < 0x0f &&
            slot.row < world.rows - 1 &&
            isSolidDrum(world.getTile(slot.row + 1, slot.col))) {
          slot.flag |= 2;
          slot.y = Math.floor(slot.y / 32) * 32 + 0x0b;
          slot.topY = Math.floor(slot.y / 16) * 16;
          slot.state = 0;
          slot.prom = 0;
          return;
        }

        slot.y = slot.topY;
      } else if (slot.state === 6) {
        const ladderRow = Math.max(0, Math.min(world.rows - 1, Math.floor(slot.topY / 32)));
        if (this.checkLadderHoldHazard(slot, world, ladderRow)) return;
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          slot.facing = slot.dir;
          if (slot.prom < 10) {
            if ((slot.flag & 2) === 0) {
              this.snapY(slot);
            }
            if (this.canPassWall(slot, b, world)) {
              slot.prom = 0;
              slot.state = 1;
              slot.kind = null;
              slot.n = 0;
              return;
            }
          }
        }
        slot.n += 1;
        const limit = slot.kind === "enter_top_cont" ? 16 : 12;
        if (slot.n >= limit) {
          slot.state = 2;
          slot.kind = null;
          slot.n = 0;
        }
      } else if (slot.state === 8) {
        slot.x = world.wrapX(slot.x + (slot.dir === RIGHT ? 1 : -1));
        slot.aux -= 1;
        if (slot.aux === 0) {
          slot.aux = 1;
          this.tryEnterHole(slot, world);
        }
      } else if (slot.state === 9) {
        slot.x = world.wrapX(slot.x + (slot.dir === RIGHT ? 1 : -1));
        this.updateCR(slot, world);
        if (slot.row === slot.auxRow && slot.col === slot.aux && (slot.x & 0x0f) === 0) {
          if (slot.flag & 2) {
            slot.flag &= ~0x02;
            slot.prom = 0x1d;
            slot.topY = Math.floor(slot.y / 32) * 32;
          }
          slot.state = (slot.prom !== 0) ? 2 : 0;
        }
      } else if (slot.state === 2) {
        slot.flag &= ~0x02;
        const ladderRow = Math.max(0, Math.min(world.rows - 1, Math.floor(slot.topY / 32)));
        if (this.checkLadderHoldHazard(slot, world, ladderRow)) return;
        const curTile = world.getTile(slot.row, slot.col);
        if (this.trySideTransition(slot, b, world)) return;
        if (b & (UP | DOWN)) {
          slot.dir = b & (UP | DOWN);
          const d = (slot.dir & DOWN) ? -1 : 1;
          const nextProm = slot.prom + d;
          if (nextProm === 0x1f && (isSolidDrum(curTile) || isHoleTile(curTile))) {
            return;
          }
          slot.prom = nextProm;
          if (slot.prom >= 32) {
            slot.y = slot.topY;
            slot.prom = 0;
            this.finishLadderSegment(slot, world, "arrive_top");
          } else if (slot.prom <= 0) {
            slot.y = slot.topY + 32;
            slot.prom = 0;
            this.finishLadderSegment(slot, world, "arrive");
          } else {
            slot.y = slot.topY + relYOfProm(slot.prom);
          }
          return;
        }
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          slot.facing = slot.dir;
          const canExit = slot.prom < 10 ||
            (slot.prom >= 31 && this.isContinuousLadderSegment(slot.row, slot.col, world));
          if (canExit) {
            if ((slot.flag & 2) === 0) {
              this.snapY(slot);
            }
            if (!this.canPassWall(slot, b, world)) return;
            slot.prom = 0;
            slot.state = 1;
          }
        }
      }
    }
  }

  class SpikeAI {
    constructor() {
      this.mem39 = 4;
      this.timer = 0;
    }

    update(world) {
      const sp = world.spike;
      const ma = world.mario;
      if (sp.state === 15 || sp.state === 16) {
        sp.bits = 0;
        return;
      }

      if (ma.row === sp.row && sp.y === ma.y) {
        let v = (this.timer - 1) & 0xff;
        if (v >= 0x80) {
          v = 0x20;
          if (ma.dir === this.mem39) {
            v = 0;
            sp.bits = this.horizontalVsMario(ma, sp);
          }
        }
        this.timer = v;
        this.mem39 = ma.dir;
        this.wallAvoid(world, 0, 0);
        return;
      }

      const vert = (ma.row !== sp.row)
        ? (sp.row > ma.row ? UP : DOWN)
        : (sp.y > ma.y ? UP : DOWN);
      const { horiz, bestRow, bestCol } = this.horizontalVsLadder(world, vert);
      sp.bits = vert | horiz;
      this.wallAvoid(world, bestRow, bestCol);
    }

    wallAvoid(world, bestRow, bestCol) {
      const sp = world.spike;
      const ma = world.mario;
      const horiz = sp.bits & 0x03;
      if (horiz === 0) return;

      const isRight = (horiz & RIGHT) !== 0;
      let wallCol = null;

      if (isRight) {
        for (let c = sp.col + 1; c < world.cols; c++) {
          if (isSolidDrum(world.getTile(sp.row, c))) {
            wallCol = c;
            break;
          }
        }
      } else {
        for (let c = sp.col - 1; c >= 0; c--) {
          if (isSolidDrum(world.getTile(sp.row, c))) {
            wallCol = c;
            break;
          }
        }
      }

      if (wallCol === null) return;

      const sameRow = ma.row === sp.row;
      const wallPos = sp.row * world.cols + wallCol;
      const maPos = ma.row * world.cols + ma.col;

      if (isRight) {
        if (!sameRow && wallCol >= bestCol) return;
        if (wallPos >= maPos) return;
      } else {
        if (!sameRow && wallCol < bestCol) return;
        if (wallPos < maPos) return;
      }
      sp.bits ^= 0x03;
    }

    horizontalVsLadder(world, vert) {
      const sp = world.spike;
      const searchRow = vert === UP ? sp.row : Math.min(world.rows - 1, sp.row + 1);
      let bestCol = 0;
      let bestRow = 0;
      let minDist = world.cols + 1;
      let found = false;

      for (let c = 0; c < world.cols; c++) {
        if (isLadderTile(world.getTile(searchRow, c))) {
          const dist = Math.abs(c - sp.col);
          if (dist < minDist) {
            minDist = dist;
            bestCol = c;
            bestRow = searchRow;
            found = true;
          }
        }
      }

      if (!found) {
        bestRow = 0;
        bestCol = 0;
      }

      const bestPos = bestRow * world.cols + bestCol;
      const spPos = searchRow * world.cols + sp.col;

      if (bestPos === spPos) {
        return { horiz: sp.dir & 0x03, bestRow, bestCol };
      }
      return { horiz: bestPos < spPos ? LEFT : RIGHT, bestRow, bestCol };
    }

    horizontalVsMario(ma, sp) {
      if (ma.col === sp.col) return 0;
      return ma.col < sp.col ? LEFT : RIGHT;
    }
  }

  class GameWorld {
    constructor(config = {}) {
      this.cols = config.cols || 16;
      this.rows = config.rows || 8;
      this.worldWidth = this.cols * 16;
      this.f = 0;
      this.tiles = new Uint8Array(this.cols * this.rows);
      this.waves = [];
      this.explosions = [];
      this.breakEffects = [];
      this.crumblingLadders = new Map();
      this.pillarBreaks = new Map();
      this.fallingPillars = [];
      this.doors = [];
      this.doorMap = new Map();
      this.spikeAggressive = !!config.spikeAggressive;

      const stepper = new ActorStepper();
      this.stepper = stepper;
      this.mario = new Actor(true);
      this.spike = new Actor(false);
      this.spikeAI = new SpikeAI();

      if (config.tiles) {
        this.loadTiles(config.tiles);
      }
      if (config.mario) {
        Object.assign(this.mario, config.mario);
        if ((this.mario.dir & (LEFT | RIGHT)) !== 0) {
          this.mario.facing = this.mario.dir & (LEFT | RIGHT);
        }
      }
      if (config.spike) {
        Object.assign(this.spike, config.spike);
        if ((this.spike.dir & (LEFT | RIGHT)) !== 0) {
          this.spike.facing = this.spike.dir & (LEFT | RIGHT);
        }
      }
      if (config.spikeAI) {
        Object.assign(this.spikeAI, config.spikeAI);
      }

      this.stepper.updateCR(this.mario, this);
      this.stepper.updateCR(this.spike, this);
    }

    wrapX(x) {
      const w = this.worldWidth;
      return ((x % w) + w) % w;
    }

    wrapCol(col) {
      const c = this.cols;
      return ((col % c) + c) % c;
    }

    cellKey(row, col) {
      return row + "," + this.wrapCol(col);
    }

    getCrumblingInfo(row, col) {
      return this.crumblingLadders.get(this.cellKey(row, col)) || null;
    }

    hasCrumblingBelowSame(row, col) {
      const info = this.getCrumblingInfo(row, col);
      return info ? info.hasBelowSame : false;
    }

    getPillarBreakInfo(row, col) {
      return this.pillarBreaks.get(this.cellKey(row, col)) || null;
    }

    ensureDoorSlot(row, col) {
      const wc = this.wrapCol(col);
      const key = this.cellKey(row, wc);
      let door = this.doorMap.get(key);
      if (!door) {
        door = {
          row,
          col: wc,
          state: 1,
          stepTimer: 0,
          openTimer: 0,
          byMario: true
        };
        this.doors.push(door);
        this.doorMap.set(key, door);
      }
      return door;
    }

    removeDoorSlot(row, col) {
      const wc = this.wrapCol(col);
      const key = this.cellKey(row, wc);
      const door = this.doorMap.get(key);
      if (!door) return;
      this.doorMap.delete(key);
      const idx = this.doors.indexOf(door);
      if (idx >= 0) {
        this.doors.splice(idx, 1);
      }
    }

    loadTiles(src) {
      if (Array.isArray(src)) {
        for (const item of src) {
          this.setTile(item[0], item[1], item[2]);
        }
      } else {
        for (const [k, v] of Object.entries(src)) {
          if (k.includes(",")) {
            const [r, c] = k.split(",").map(Number);
            this.setTile(r, c, v);
          } else {
            const addr = Number(k);
            const pos = addr >= 0x500 ? addr - 0x500 : addr;
            const r = (pos >> 4) & 0x0f;
            const c = pos & 0x0f;
            this.setTile(r, c, v);
          }
        }
      }
    }

    setTile(row, col, val) {
      if (row < 0 || row >= this.rows) return;
      const wc = this.wrapCol(col);
      this.tiles[row * this.cols + wc] = val;
      if (val === TILE.DOOR) {
        this.ensureDoorSlot(row, wc);
      } else if (!isDoorRelatedTile(val)) {
        this.removeDoorSlot(row, wc);
      }
    }

    getTile(row, col) {
      if (row < 0 || row >= this.rows) return TILE.EMPTY;
      const wc = this.wrapCol(col);
      return this.tiles[row * this.cols + wc];
    }

    countBreakables() {
      let count = 0;
      for (let i = 0; i < this.tiles.length; i++) {
        if (isClearTargetTile(this.tiles[i])) {
          count += 1;
        }
      }
      for (let i = 0; i < this.fallingPillars.length; i++) {
        if (isClearTargetTile(this.fallingPillars[i].payloadTile)) {
          count += 1;
        }
      }
      return count;
    }

    openDoor(row, col, byMario = true, openDuration = 0x50) {
      if (row < 0 || row >= this.rows) return false;
      const c = this.wrapCol(col);
      const door = this.ensureDoorSlot(row, c);
      door.state = 2;
      door.stepTimer = 4;
      door.openTimer = openDuration;
      door.byMario = !!byMario;
      this.setTile(row, c, byMario ? TILE.DOOR_OPENING_1 : (TILE.DOOR_OPENING_1 | 0x08));
      return true;
    }

    openAllDoors(byMario = true, openDuration = 0x20) {
      for (let i = 0; i < this.doors.length; i++) {
        const door = this.doors[i];
        if (door.state === 0) continue;
        door.state = 2;
        door.stepTimer = 4;
        door.openTimer = openDuration;
        door.byMario = !!byMario;
        this.setTile(door.row, door.col, byMario ? TILE.DOOR_OPENING_1 : (TILE.DOOR_OPENING_1 | 0x08));
      }
    }

    holdDoorsOpen() {
      for (let i = 0; i < this.doors.length; i++) {
        if (this.doors[i].state !== 0) {
          this.doors[i].openTimer = 0x40;
        }
      }
    }

    updateDoors() {
      if (this.doors.length === 0) return;
      for (let i = 0; i < this.doors.length; i++) {
        const door = this.doors[i];
        if (door.state <= 1) continue;
        if (door.stepTimer > 0) {
          door.stepTimer -= 1;
          continue;
        }
        door.stepTimer = 4;
        if (door.state === 2) {
          const bit3 = this.getTile(door.row, door.col) & 0x08;
          this.setTile(door.row, door.col, TILE.DOOR_OPENING_2 | bit3);
          door.state = 3;
        } else if (door.state === 3) {
          this.setTile(door.row, door.col, TILE.DOOR_OPEN);
          door.state = 4;
        } else if (door.state === 4) {
          door.openTimer -= 1;
          if (door.openTimer <= 0) {
            this.setTile(door.row, door.col, TILE.DOOR_CLOSING_1);
            door.state = 5;
          }
        } else if (door.state === 5) {
          this.setTile(door.row, door.col, TILE.DOOR_CLOSING_2);
          door.state = 6;
        } else if (door.state === 6) {
          this.setTile(door.row, door.col, TILE.DOOR);
          door.state = 1;
          door.stepTimer = 0;
        }
      }
    }

    startCrumblingLadder(row, col, byMario, spreadUp = true, spreadDown = true) {
      if (row < 0 || row >= this.rows) return false;
      const c = this.wrapCol(col);
      if (this.getTile(row, c) !== TILE.BREAK_LADDER) return false;

      const belowTile = row < this.rows - 1 ? this.getTile(row + 1, c) : TILE.EMPTY;
      const hasBelowSame = row < this.rows - 1 &&
        (belowTile === TILE.BREAK_LADDER || isCrumblingLadderTile(belowTile));

      this.setTile(row, c, TILE.CRUMBLING_4);
      this.crumblingLadders.set(this.cellKey(row, c), {
        row,
        col: c,
        stage: 4,
        timer: COLLAPSE_STAGE_FRAMES,
        spreadTimer: COLLAPSE_STAGE_FRAMES,
        spreadUp,
        spreadDown,
        hasBelowSame,
        byMario: !!byMario
      });
      return true;
    }

    updateCrumblingLadders() {
      if (this.crumblingLadders.size === 0) return;
      const entries = Array.from(this.crumblingLadders.values());
      const toSpread = [];

      for (const e of entries) {
        if (e.spreadUp || e.spreadDown) {
          e.spreadTimer -= 1;
          if (e.spreadTimer <= 0) {
            if (e.spreadUp && e.row > 0 && this.getTile(e.row - 1, e.col) === TILE.BREAK_LADDER) {
              toSpread.push({ row: e.row - 1, col: e.col, byMario: e.byMario, up: true, down: false });
            }
            if (e.spreadDown && e.row < this.rows - 1 && this.getTile(e.row + 1, e.col) === TILE.BREAK_LADDER) {
              toSpread.push({ row: e.row + 1, col: e.col, byMario: e.byMario, up: false, down: true });
            }
            e.spreadUp = false;
            e.spreadDown = false;
          }
        }

        e.timer -= 1;
        if (e.timer <= 0) {
          e.stage -= 1;
          e.timer = COLLAPSE_STAGE_FRAMES;
          if (e.stage <= 0) {
            this.crumblingLadders.delete(this.cellKey(e.row, e.col));
            this.setTile(e.row, e.col, e.hasBelowSame ? TILE.HOLE_CRUMBLED : TILE.EMPTY);
            this.breakEffects.push({ row: e.row, col: e.col, tile: TILE.BREAK_LADDER, timer: 16, maxTimer: 16 });
          } else {
            this.setTile(e.row, e.col, 0x50 + e.stage);
          }
        }
      }

      for (const s of toSpread) {
        this.startCrumblingLadder(s.row, s.col, s.byMario, s.up, s.down);
      }
    }

    triggerPillar(row, col, byMario) {
      if (row < 0 || row >= this.rows) return false;
      const c = this.wrapCol(col);

      // 支柱自身の崩壊開始 ($75 -> $74 -> $73 -> $72 -> $71 -> $00, 1+8*4=33F)
      this.setTile(row, c, 0x75);
      this.pillarBreaks.set(this.cellKey(row, c), {
        row,
        col: c,
        stage: 5,
        timer: 1,
        byMario: !!byMario
      });

      if (row >= 1 && this.fallingPillars.length < 12) {
        const aboveRow = row - 1;
        const aboveTile = this.getTile(aboveRow, c);
        const payload = getPillarFallPayload(aboveTile);
        if (payload !== null) {
          this.crumblingLadders.delete(this.cellKey(aboveRow, c));
          const isContLadder = (aboveTile === TILE.LADDER || aboveTile === TILE.BREAK_LADDER) &&
            aboveRow >= 1 &&
            isSameLadderType(aboveTile, this.getTile(aboveRow - 1, c));

          // 0F目から1行上は即座に $0C (穴落下判定) になり、オブジェクトは 30F 滞空する
          this.setTile(aboveRow, c, TILE.HOLE_FALLING);
          this.fallingPillars.push({
            row: aboveRow,
            targetRow: row,
            col: c,
            payloadTile: payload,
            origAboveTile: aboveTile,
            isDrum: aboveTile === TILE.DRUM,
            isFloorOnly: payload === TILE.EMPTY,
            aboveDoneHole: isContLadder ? TILE.HOLE_PILLAR_LAD : TILE.HOLE,
            stage: 1,
            timer: 30
          });
        }
      }
      return true;
    }

    updatePillarBreakTiles() {
      if (this.pillarBreaks.size === 0) return;
      const entries = Array.from(this.pillarBreaks.values());
      for (const e of entries) {
        e.timer -= 1;
        if (e.timer <= 0) {
          e.stage -= 1;
          if (e.stage <= 0) {
            this.pillarBreaks.delete(this.cellKey(e.row, e.col));
            this.setTile(e.row, e.col, TILE.EMPTY);
            this.breakEffects.push({ row: e.row, col: e.col, tile: TILE.PILLAR, timer: 14, maxTimer: 14 });
          } else {
            e.timer = COLLAPSE_STAGE_FRAMES;
            this.setTile(e.row, e.col, 0x70 + e.stage);
          }
        }
      }
    }

    updateFallingPillars() {
      if (this.fallingPillars.length === 0) return;
      for (let i = this.fallingPillars.length - 1; i >= 0; i--) {
        const fp = this.fallingPillars[i];
        fp.timer -= 1;
        if (fp.timer > 0) continue;

        fp.timer = 4;
        if (fp.stage === 1 && fp.isDrum) {
          // 30F目: ドラム缶落下中は下の鉄柱マスを $0D へ (閉じ込め捕獲開始)
          this.pillarBreaks.delete(this.cellKey(fp.targetRow, fp.col));
          this.setTile(fp.targetRow, fp.col, TILE.DRUM_FALLING);
        }

        fp.stage += 1;
        if (fp.stage >= 5) {
          // 42F目 (30 + 4*3): 着地完了
          this.fallingPillars.splice(i, 1);
          this.pillarBreaks.delete(this.cellKey(fp.targetRow, fp.col));
          this.setTile(fp.targetRow, fp.col, fp.payloadTile);
          this.setTile(fp.row, fp.col, fp.aboveDoneHole);
        }
      }
    }

    hitCell(row, col, byMario) {
      const c = this.wrapCol(col);
      if (row < 0 || row >= this.rows) return false;
      const tile = this.getTile(row, c);
      if (!isBreakableTile(tile)) return false;

      if (tile === TILE.BOMB) {
        this.triggerBomb(row, c, byMario);
        return true;
      }

      if (tile === TILE.BREAK_LADDER) {
        return this.startCrumblingLadder(row, c, byMario, true, true);
      }

      if (tile === TILE.DOOR) {
        return this.openDoor(row, c, byMario, 0x50);
      }

      if (tile === TILE.PILLAR) {
        return this.triggerPillar(row, c, byMario);
      }

      const hp = tile & 0x07;
      if (hp > 1) {
        this.setTile(row, c, tile - 1);
      } else {
        this.setTile(row, c, TILE.EMPTY);
        this.breakEffects.push({ row, col: c, tile, timer: 16, maxTimer: 16 });
        this.explosions.push({
          row,
          col: c,
          timer: COLLAPSE_TOTAL_FRAMES,
          maxTimer: COLLAPSE_TOTAL_FRAMES,
          age: 0,
          kind: "wall",
          byMario: !!byMario
        });
      }
      return true;
    }

    triggerBomb(row, col, byMario = true) {
      const c = this.wrapCol(col);
      this.setTile(row, c, TILE.EMPTY);
      this.openAllDoors(byMario, 0x20);
      this.explosions.push({
        row,
        col: c,
        timer: 26,
        maxTimer: 26,
        age: 0,
        kind: "bomb",
        byMario: !!byMario
      });
      this.waves.push({ row, col: this.wrapCol(c - 1), dir: -1, timer: 10, stepsLeft: this.cols - 1, byMario: !!byMario });
      this.waves.push({ row, col: this.wrapCol(c + 1), dir: 1, timer: 10, stepsLeft: this.cols - 1, byMario: !!byMario });
    }

    updateEffectsAndWaves() {
      this.updateDoors();
      this.updateCrumblingLadders();
      this.updatePillarBreakTiles();
      this.updateFallingPillars();

      for (let i = this.explosions.length - 1; i >= 0; i--) {
        const ex = this.explosions[i];
        ex.age = (ex.age || 0) + 1;
        ex.timer -= 1;
        if (ex.timer <= 0) {
          this.explosions.splice(i, 1);
        }
      }
      for (let i = this.breakEffects.length - 1; i >= 0; i--) {
        this.breakEffects[i].timer -= 1;
        if (this.breakEffects[i].timer <= 0) {
          this.breakEffects.splice(i, 1);
        }
      }

      if (this.waves.length === 0) return;
      const prevWaves = this.waves;
      this.waves = [];
      const nextWaves = [];

      for (const w of prevWaves) {
        w.timer -= 1;
        if (w.timer > 0) {
          nextWaves.push(w);
          continue;
        }

        const t = this.getTile(w.row, w.col);
        if (isDoorRelatedTile(t)) {
          if (w.stepsLeft > 1) {
            nextWaves.push({
              row: w.row,
              col: this.wrapCol(w.col + w.dir),
              dir: w.dir,
              timer: 10,
              stepsLeft: w.stepsLeft - 1,
              byMario: true
            });
          }
          continue;
        }
        if (!isBreakableTile(t)) continue;

        this.hitCell(w.row, w.col, true);

        if (t !== TILE.BOMB) {
          const afterTile = this.getTile(w.row, w.col);
          if (t === TILE.BREAK_LADDER || afterTile !== TILE.EMPTY) {
            this.explosions.push({ row: w.row, col: w.col, timer: 10, maxTimer: 10, age: 0, kind: "spark", byMario: true });
          }
        }
        if (w.stepsLeft > 1) {
          nextWaves.push({
            row: w.row,
            col: this.wrapCol(w.col + w.dir),
            dir: w.dir,
            timer: 10,
            stepsLeft: w.stepsLeft - 1,
            byMario: true
          });
        }
      }
      this.waves = nextWaves.concat(this.waves);
    }

    updateSpikeHammer() {
      const sp = this.spike;
      const ma = this.mario;
      sp.bits &= ~HAMMER;
      if (sp.state === 4 || sp.state === 10 || sp.state === 11 || sp.state === 15 || sp.state === 16) {
        return;
      }

      const tile = this.getTile(sp.row, sp.col);
      if (tile === TILE.BOMB || !isBreakableTile(tile)) return;

      const sameCell = sp.row === ma.row && sp.col === ma.col;
      if (tile === TILE.DOOR || sameCell || this.spikeAggressive) {
        sp.bits |= HAMMER;
      }
    }

    step(inputBits = 0) {
      let b = inputBits;
      if ((b & (LEFT | RIGHT)) === (LEFT | RIGHT)) {
        b &= ~(LEFT | RIGHT);
      }
      if ((b & (UP | DOWN)) === (UP | DOWN)) {
        b &= ~(UP | DOWN);
      }

      const hammerNow = (b & HAMMER) !== 0;
      const hammerEdge = hammerNow && !this.mario.prevHammer;
      this.mario.prevHammer = hammerNow;
      this.mario.bits = (b & ~HAMMER) | (hammerEdge ? HAMMER : 0);

      this.stepper.step(this.mario, this);

      if (this.f % 2 === 1) {
        this.spikeAI.update(this);
      }
      this.updateSpikeHammer();
      this.stepper.step(this.spike, this);

      this.updateEffectsAndWaves();
      this.f += 1;
    }
  }

  const api = {
    RIGHT, LEFT, DOWN, UP, HAMMER,
    TILE,
    getHammerTiming,
    isBreakableTile,
    isClearTargetTile,
    isLadderTile,
    isCrumblingLadderTile,
    isPillarCrumblingTile,
    isDoorOpeningTile,
    isDoorRelatedTile,
    isSameLadderType,
    isHoleTile,
    isFallHoleTile,
    isSolidDrum,
    Actor,
    ActorStepper,
    SpikeAI,
    GameWorld
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.WreckGame = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
