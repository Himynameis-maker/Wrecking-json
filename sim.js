(function (root) {
  "use strict";

  const RIGHT = 1;
  const LEFT = 2;
  const DOWN = 4;
  const UP = 8;

  const DEFAULT_LADDERS = { 0x515: 1 };
  const SUPPORTED_ADDRS = new Set([
    0x300, 0x308, 0x309, 0x30d, 0x30e, 0x30f, 0x312, 0x313, 0x315, 0x316, 0x317,
    0x320, 0x328, 0x329, 0x32d, 0x32e, 0x32f, 0x332, 0x333, 0x335, 0x336, 0x337,
    0x339, 0x33a
  ]);

  // State 5 落下速度テーブル ($BFB0〜$BFCF: 前半=Mario用, 後半$12〜=Spike用)
  const FALL_TABLE = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 2, 1, 2, 2, 3, -1,
    0, 1, 0, 1, 1, 2, 1, 2, 2, 2, 3, 2, 3, -1
  ];

  function relYOfProm(prom) {
    if (prom <= 4) return 31;
    if (prom <= 9) return 27;
    if (prom <= 14) return 23;
    if (prom <= 19) return 19;
    if (prom <= 24) return 15;
    return 11;
  }

  // 全キャラ共通のスロット枠（+$00〜+$17 相当の基本状態）
  class Slot {
    constructor(base, stepper) {
      this.base = base;
      this.stepper = stepper;
      this.state = 0;       // $0300/$0320
      this.bits = 0;        // $0308/$0328
      this.x = 80;          // $0309/$0329
      this.y = 64;          // $0315/$0335
      this.y_hi = 0;        // $0316/$0336 (16bit Y上位)
      this.dir = 4;         // $0312/$0332
      this.top_y = 32;      // $0313/$0333 (State2/3/6:上端Y, State5:前Y下位)
      this.top_y_hi = 0;    // $0314/$0334 (State5:前Y上位)
      this.avail = 0;       // $030E/$032E
      this.cr = 0x15;       // $030F/$032F
      this.flag = 0;        // $0317/$0337 (bit1 = 壁8頭上)
      this.n = 0;           // 境界ステートの経過フレーム
      this.kind = null;     // 'enter' / 'arrive' / 'arrive_top' / 'enter_top' / 'cont' / 'enter_top_cont'
      this.prom = 0;        // $030D/$032D
    }

    step(world) {
      this.stepper.step(this, world);
    }
  }

  // マリオ・親方 共通移動ステートマシン（$BB78〜 準拠）
  class MarioSpikeStepper {
    updateCR(slot) {
      slot.cr = (((((slot.y - 32) & 0xff) >> 1) & 0xf0) | (((slot.x + 8) & 0xff) >> 4));
    }

    snapY(slot) {
      const sum = slot.y + 8;
      slot.y_hi = (slot.y_hi + (sum >> 8)) & 0xff;
      slot.y = sum & 0xe0;
      slot.flag &= ~0x02;
    }

    isContinuousLadder(cr, world) {
      return cr < 0x70 &&
        world.getTile(0x500 + cr) === 1 &&
        world.getTile(0x500 + cr + 0x10) === 1;
    }

    snapIfContLadderIdle(slot, world) {
      if (world.getTile(0x500 + slot.cr) === 1 && world.getTile(0x500 + slot.cr + 0x10) === 1) {
        slot.x = (slot.x + 8) & 0xf0;
      }
    }

    canPassWall(slot, b, world) {
      if ((slot.x & 0x0f) !== 0) return true;
      const targetPos = (b & RIGHT) ? ((slot.cr + 1) & 0xff) : ((slot.cr - 1) & 0xff);
      const tile = world.getTile(0x500 + targetPos);
      if (slot.flag & 2) {
        if (tile === 1 || tile === 0xd1) {
          return world.getTile(0x510 + targetPos) === tile;
        }
        return tile >= 9 && tile < 12;
      }
      return tile !== 8;
    }

    tryEnterHole(slot, world) {
      if (slot.flag & 2) {
        if (world.getTile(0x510 + slot.cr) === 8) return false;
      } else {
        const curTile = world.getTile(0x500 + slot.cr);
        if (curTile < 9 || curTile >= 13) return false;
      }
      if (((slot.x + 3) & 0x0f) >= 6) return false;

      if (slot.base === 0x300) {
        slot.x = (slot.x + 8) & 0xf0;
      }
      slot.prom = (slot.base === 0x300) ? 0 : 0x12;
      slot.top_y = slot.y;
      slot.state = 5;
      return true;
    }

    tryEnterLadder(slot, b, world) {
      const curTile = world.getTile(0x500 + slot.cr);
      if (curTile >= 9 && curTile < 12) return false;

      const row = (slot.cr >> 4) & 0xf;
      const canUp = curTile === 1;
      const canDown = row < 7 && world.getTile(0x500 + slot.cr + 0x10) === 1;
      let avail = (canUp ? 2 : 0) | (canDown ? 1 : 0);
      if (avail !== 0 && ((slot.x + 6) & 0xf) >= 12) {
        avail = 0;
      }
      slot.avail = avail;

      if (avail === 0) return false;
      if ((b & (UP | DOWN)) === 0) return false;
      const matched = ((b & (UP | DOWN)) >> 2) & avail;
      if (matched === 0) return false;
      if (matched !== 1 && row === 0) return false;

      slot.dir = b & (UP | DOWN);
      slot.x = (slot.x + 8) & 0xf0;
      if (matched === 1) {
        slot.top_y = slot.y;
        slot.prom = 31;
        slot.state = 3;
        slot.kind = "enter_top";
        slot.n = 1;
      } else {
        slot.top_y = (slot.y - 32) & 0xff;
        slot.prom = 1;
        slot.state = 3;
        slot.kind = "enter";
        slot.n = 1;
      }
      if (this.isContinuousLadder(slot.cr, world)) {
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
      this.updateCR(slot);
      if (this.isContinuousLadder(slot.cr, world)) {
        if ((slot.cr & 0xf0) === 0) {
          slot.state = 0;
          slot.kind = null;
          slot.n = 0;
          slot.avail = 0;
          return;
        }
        if (slot.dir & DOWN) {
          slot.top_y = slot.y;
          slot.prom = 31;
        } else {
          slot.top_y = (slot.y - 32) & 0xff;
          slot.prom = 1;
        }
        slot.state = 6;
        slot.kind = "cont";
        slot.n = 1;
        const rowBits = slot.cr & 0xf0;
        slot.avail = (rowBits !== 0 ? 1 : 0) | (rowBits !== 0x70 ? 2 : 0);
        return;
      }
      slot.state = 3;
      slot.kind = arriveKind;
      slot.n = 1;
      slot.avail = 0;
    }

    step(slot, world) {
      this.updateCR(slot);
      const b = slot.bits;

      if (slot.state === 0) {
        if (this.tryEnterLadder(slot, b, world)) return;
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
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
        if (this.tryEnterLadder(slot, b, world)) return;
        if (this.tryEnterHole(slot, world)) return;
        if (!this.canPassWall(slot, b, world)) {
          slot.state = 0;
          slot.dir = (slot.dir + 1) & 0xff;
          return;
        }
        if ((b & (LEFT | RIGHT)) && (b & (LEFT | RIGHT)) === (slot.dir & (LEFT | RIGHT))) {
          const stepX = (slot.dir & LEFT) ? -1 : 1;
          slot.x = (slot.x + stepX) & 0xff;
        } else {
          slot.state = 0;
          slot.dir = (slot.dir + 1) & 0xff;
        }
      } else if (slot.state === 3) {
        slot.n += 1;
        let limit = 6;
        if (slot.kind === "arrive_top") {
          limit = 12;
        } else if (slot.kind === "enter_top") {
          limit = slot.base === 0x300 ? 12 : 9;
        }
        if (slot.n >= limit) {
          slot.state = (slot.kind === "enter" || slot.kind === "enter_top") ? 2 : 0;
          slot.kind = null;
          slot.n = 0;
        }
      } else if (slot.state === 5) {
        slot.x = (slot.x + 8) & 0xf0;
        slot.prom = (slot.prom + 1) & 0xff;
        let spd = FALL_TABLE[slot.prom];
        if (spd < 0) {
          slot.prom = (slot.prom - 1) & 0xff;
          spd = FALL_TABLE[slot.prom];
        }
        const sum = slot.top_y + spd;
        slot.y = sum & 0xff;
        slot.top_y = slot.y;
        slot.y_hi = (slot.y_hi + (sum >> 8)) & 0xff;
        slot.top_y_hi = slot.y_hi;

        if (((slot.y + 2) & 0x1f) < 4) {
          this.snapY(slot);
          this.updateCR(slot);
          const t = world.getTile(0x500 + slot.cr);
          const isHole = t >= 9 && t < 13;
          const isContLad = (t === 1 || t === 0xd1) &&
            slot.cr < 0x70 &&
            world.getTile(0x510 + slot.cr) === t;
          if (!isHole && !isContLad) {
            slot.state = 0;
            slot.prom = 0;
            return;
          }
        }

        const yMod = slot.y & 0x1f;
        if (yMod >= 0x0b && yMod < 0x0f && world.getTile(0x510 + slot.cr) === 8) {
          slot.flag |= 2;
          slot.y = (slot.y & 0xf0) | 0x0b;
          slot.top_y = slot.y & 0xf0;
          slot.top_y_hi = slot.y_hi;
          slot.state = 0;
          slot.prom = 0;
          return;
        }

        slot.y = slot.top_y;
        slot.y_hi = slot.top_y_hi;
      } else if (slot.state === 6) {
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
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
      } else if (slot.state === 2) {
        slot.flag &= ~0x02;
        if (b & (UP | DOWN)) {
          slot.dir = b & (UP | DOWN);
          const d = (slot.dir & DOWN) ? -1 : 1;
          slot.prom += d;
          if (slot.prom >= 32) {
            slot.y = slot.top_y;
            slot.prom = 0;
            this.finishLadderSegment(slot, world, "arrive_top");
          } else if (slot.prom <= 0) {
            slot.y = (slot.top_y + 32) & 0xff;
            slot.prom = 0;
            this.finishLadderSegment(slot, world, "arrive");
          } else {
            slot.y = (slot.top_y + relYOfProm(slot.prom)) & 0xff;
          }
          return;
        }
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          const canExit = slot.prom < 10 || (slot.prom >= 31 && this.isContinuousLadder(slot.cr, world));
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

  // 親方（Spike）専用AI（$D112〜 準拠）
  class SpikeAI {
    constructor() {
      this.mem39 = 4;
      this.timer = 0;
    }

    update(world) {
      const sp = world.spike;
      const ma = world.mario;
      const rowM = ma.cr & 0xf0;
      const rowS = sp.cr & 0xf0;

      if (rowM === rowS && sp.y === ma.y) {
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
        this.wallAvoid(world, 0);
        return;
      }

      const vert = (rowM !== rowS)
        ? (rowS > rowM ? UP : DOWN)
        : (sp.y > ma.y ? UP : DOWN);
      const { horiz, bestPos } = this.horizontalVsLadder(world, vert);
      sp.bits = vert | horiz;
      this.wallAvoid(world, bestPos);
    }

    wallAvoid(world, bestPos) {
      const sp = world.spike;
      const ma = world.mario;
      const horiz = sp.bits & 0x03;
      if (horiz === 0) return;

      let y = sp.cr;
      let col = y & 0x0f;
      const isRight = (horiz & RIGHT) !== 0;
      let wallPos = null;

      if (isRight) {
        while (true) {
          y = (y + 1) & 0xff;
          if (world.getTile(0x500 + y) === 8) {
            wallPos = y;
            break;
          }
          col += 1;
          if (col === 0x10) break;
        }
      } else {
        while (true) {
          y = (y - 1) & 0xff;
          if (world.getTile(0x500 + y) === 8) {
            wallPos = y;
            break;
          }
          col = (col - 1) & 0xff;
          if (col >= 0x80) break;
        }
      }

      if (wallPos === null) return;
      const sameRow = (ma.cr & 0xf0) === (sp.cr & 0xf0);
      if (isRight) {
        if (!sameRow && (wallPos & 0x0f) >= (bestPos & 0x0f)) return;
        if (wallPos >= ma.cr) return;
      } else {
        if (!sameRow && (wallPos & 0x0f) < (bestPos & 0x0f)) return;
        if (wallPos < ma.cr) return;
      }
      sp.bits ^= 0x03;
    }

    horizontalVsLadder(world, vert) {
      const sp = world.spike;
      const spRow = (sp.cr >> 4) & 0xf;
      const cSp = sp.cr & 0xf;
      const searchRow = vert === UP ? spRow : (spRow + 1);
      const spPos = (searchRow << 4) | cSp;
      let bestPos = 0;
      let minDist = 16;

      for (let c = 0; c < 16; c++) {
        const pos = (searchRow << 4) | c;
        if (world.getTile(0x500 + pos) === 1) {
          const dist = Math.abs(c - cSp);
          if (dist < minDist) {
            minDist = dist;
            bestPos = pos;
          }
        }
      }

      if (bestPos === spPos) {
        return { horiz: sp.dir & 0x03, bestPos };
      }
      return { horiz: bestPos < spPos ? LEFT : RIGHT, bestPos };
    }

    horizontalVsMario(ma, sp) {
      if (ma.cr === sp.cr) return 0;
      return ma.cr < sp.cr ? LEFT : RIGHT;
    }
  }

  class Sim {
    constructor(inputs = {}, writes = {}, init = null) {
      this.inputs = inputs;
      this.writes = writes;
      this.f = 0;

      const walker = new MarioSpikeStepper();
      this.mario = new Slot(0x300, walker);
      this.spike = new Slot(0x320, walker);
      this.spikeAI = new SpikeAI();
      this.ladders = new Map(
        Object.entries(DEFAULT_LADDERS).map(([k, v]) => [Number(k), v])
      );

      if (init) {
        if (init.mario) Object.assign(this.mario, init.mario);
        if (init.spike) Object.assign(this.spike, init.spike);
        if (init.spikeAI) Object.assign(this.spikeAI, init.spikeAI);
        if (init.tiles) {
          this.ladders = new Map();
          for (const [k, v] of Object.entries(init.tiles)) {
            this.ladders.set(Number(k), v);
          }
        }
      }
    }

    getTile(absAddr) {
      return this.ladders.get(absAddr) || 0;
    }

    tick() {
      const f = this.f;
      const frameWrites = this.writes[f];
      if (frameWrites) {
        for (const [addr, val] of frameWrites) {
          this.poke(addr, val);
        }
      }
      this.mario.bits = this.inputs[f - 1] || 0;
      this.mario.step(this);
      if (f % 2 === 1) {
        this.spikeAI.update(this);
      }
      this.spike.step(this);
      this.f += 1;
    }

    poke(addr, val) {
      if (addr === 0x309) this.mario.x = val;
      else if (addr === 0x315) this.mario.y = val;
      else if (addr === 0x316) this.mario.y_hi = val;
      else if (addr === 0x317) this.mario.flag = val;
      else if (addr === 0x329) this.spike.x = val;
      else if (addr === 0x335) this.spike.y = val;
      else if (addr === 0x336) this.spike.y_hi = val;
      else if (addr === 0x337) this.spike.flag = val;
      else if (addr >= 0x500 && addr <= 0x5ff) this.ladders.set(addr, val);
      else throw new Error("未対応のRAM書込: $" + addr.toString(16).toUpperCase());
    }

    ram(addr) {
      if (addr >= 0x500 && addr <= 0x5ff) {
        return this.ladders.get(addr) || 0;
      }
      const m = this.mario;
      const s = this.spike;
      switch (addr) {
        case 0x300: return m.state;
        case 0x308: return m.bits;
        case 0x309: return m.x;
        case 0x30d: return m.prom;
        case 0x30e: return m.avail;
        case 0x30f: return m.cr;
        case 0x312: return m.dir;
        case 0x313: return m.top_y;
        case 0x315: return m.y;
        case 0x316: return m.y_hi;
        case 0x317: return m.flag;
        case 0x320: return s.state;
        case 0x328: return s.bits;
        case 0x329: return s.x;
        case 0x32d: return s.prom;
        case 0x32e: return s.avail;
        case 0x32f: return s.cr;
        case 0x332: return s.dir;
        case 0x333: return s.top_y;
        case 0x335: return s.y;
        case 0x336: return s.y_hi;
        case 0x337: return s.flag;
        case 0x339: return this.spikeAI.mem39;
        case 0x33a: return this.spikeAI.timer;
        default:
          throw new Error("未対応のアドレス: $" + addr.toString(16).toUpperCase());
      }
    }

    run(frames, addrs) {
      const rows = new Array(frames + 1);
      for (let i = 0; i <= frames; i++) {
        this.tick();
        const snap = {};
        for (const a of addrs) {
          snap[a] = this.ram(a);
        }
        rows[this.f - 1] = snap;
      }
      return rows;
    }
  }

  const BTN = { up: UP, down: DOWN, left: LEFT, right: RIGHT };

  function parseInputs(text) {
    const inputs = {};
    for (const raw of (text || "").replace(/;/g, "\n").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const [start, length, btn] = line.split(",").map((t) => t.trim());
      let bits = 0;
      for (const name of btn.toLowerCase().split("+")) {
        bits |= BTN[name];
      }
      const s = parseInt(start, 10);
      const len = parseInt(length, 10);
      for (let f = s; f < s + len; f++) {
        inputs[f] = (inputs[f] || 0) | bits;
      }
    }
    for (const key of Object.keys(inputs)) {
      const bits = inputs[key];
      if ((bits & (LEFT | RIGHT)) === (LEFT | RIGHT)) {
        inputs[key] = bits & ~(LEFT | RIGHT);
      }
    }
    return inputs;
  }

  function parseWrites(text) {
    const writes = {};
    for (const raw of (text || "").replace(/;/g, ",").split(",")) {
      const item = raw.trim();
      if (!item) continue;
      const [fr, rest] = item.split(":");
      const [addr, val] = rest.split("=");
      const f = parseInt(fr, 10);
      if (!writes[f]) writes[f] = [];
      writes[f].push([parseInt(addr, 16), parseInt(val, 16)]);
    }
    return writes;
  }

  function simulate(script, frames, addrs, writes = "", init = null) {
    return new Sim(parseInputs(script), parseWrites(writes), init).run(frames, addrs);
  }

  function parseCol(colName) {
    if (colName.endsWith("_col")) {
      return {
        name: colName,
        addr: parseInt(colName.slice(0, -4), 16),
        fn: (v) => v & 0x0f
      };
    }
    return {
      name: colName,
      addr: parseInt(colName, 16),
      fn: (v) => v
    };
  }

  function isSupported(addr) {
    return SUPPORTED_ADDRS.has(addr) || (addr >= 0x500 && addr <= 0x5ff);
  }

  function runGoldenTests(data) {
    const simPlan = new Map();
    for (const c of data.cases) {
      const key = JSON.stringify([c.script, c.writes, c.frames, c.init || null]);
      if (!simPlan.has(key)) {
        simPlan.set(key, {
          script: c.script,
          writes: c.writes,
          frames: c.frames,
          init: c.init || null,
          addrs: new Set()
        });
      }
      const plan = simPlan.get(key);
      for (const colName of (c.addrs || [])) {
        const { addr } = parseCol(colName);
        if (isSupported(addr)) plan.addrs.add(addr);
      }
      if (c.last_change) {
        for (const colName of Object.keys(c.last_change.expected)) {
          const { addr } = parseCol(colName);
          if (isSupported(addr)) plan.addrs.add(addr);
        }
      }
    }

    const cache = new Map();
    for (const [key, plan] of simPlan.entries()) {
      const sortedAddrs = Array.from(plan.addrs).sort((a, b) => a - b);
      cache.set(key, simulate(plan.script, plan.frames, sortedAddrs, plan.writes, plan.init));
    }

    let totalRows = 0;
    let totalLegacy = 0;
    let ng = 0;
    const skippedCols = {};
    const caseResults = [];

    for (const c of data.cases) {
      const key = JSON.stringify([c.script, c.writes, c.frames, c.init || null]);
      const simRows = cache.get(key);
      totalLegacy += c.legacy_rows || 0;

      const cols = (c.addrs || []).map(parseCol);
      const active = [];
      cols.forEach((col, idx) => {
        if (isSupported(col.addr)) {
          active.push({ pIdx: idx + 1, addr: col.addr, fn: col.fn });
        } else {
          skippedCols[col.name] = (skippedCols[col.name] || 0) + 1;
        }
      });

      const bad = [];
      let caseRows = 0;
      for (const rowStr of (c.rows || [])) {
        const parts = rowStr.split(",");
        if (parts.length !== cols.length + 1) {
          throw new Error(c.id + ": 列数不一致 (" + rowStr + ")");
        }
        const f = parseInt(parts[0], 10);
        const expVals = [];
        const gotVals = [];
        for (const a of active) {
          if (parts[a.pIdx] === "") continue;
          expVals.push(parseInt(parts[a.pIdx], 10));
          gotVals.push(a.fn(simRows[f][a.addr]));
        }
        caseRows += 1;
        if (expVals.length !== gotVals.length || expVals.some((v, i) => v !== gotVals[i])) {
          bad.push({ tag: f, exp: expVals, got: gotVals });
        }
      }

      if (c.last_change) {
        const limit = c.last_change.limit;
        const expVals = [];
        const gotVals = [];
        for (const [colName, expV] of Object.entries(c.last_change.expected)) {
          const { addr, fn } = parseCol(colName);
          let last = 0;
          let prev = fn(simRows[0][addr]);
          for (let f = 1; f <= limit; f++) {
            const v = fn(simRows[f][addr]);
            if (v !== prev) {
              last = f;
              prev = v;
            }
          }
          expVals.push(expV);
          gotVals.push(last);
        }
        caseRows += 1;
        if (expVals.some((v, i) => v !== gotVals[i])) {
          bad.push({ tag: "last_change", exp: expVals, got: gotVals });
        }
      }

      totalRows += caseRows;
      ng += bad.length;
      caseResults.push({
        id: c.id,
        name: c.name,
        ok: bad.length === 0,
        caseRows,
        bad
      });
    }

    return { totalRows, totalLegacy, ng, skippedCols, caseResults };
  }

  const api = {
    RIGHT, LEFT, DOWN, UP,
    SUPPORTED_ADDRS,
    Slot,
    MarioSpikeStepper,
    SpikeAI,
    Sim,
    parseInputs,
    parseWrites,
    simulate,
    runGoldenTests
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.WreckSim = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);