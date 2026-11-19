(function (root) {
  "use strict";

  const RIGHT = 1;
  const LEFT = 2;
  const DOWN = 4;
  const UP = 8;

  const DEFAULT_LADDERS = { 0x515: 1 };
  const SUPPORTED_ADDRS = new Set([
    0x300, 0x308, 0x309, 0x30d, 0x30f, 0x312, 0x313, 0x315,
    0x320, 0x328, 0x329, 0x32d, 0x32f, 0x332, 0x333, 0x335, 0x339, 0x33a
  ]);

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
      this.dir = 4;         // $0312/$0332
      this.top_y = 32;      // $0313/$0333
      this.cr = 0x15;       // $030F/$032F
      this.n = 0;           // 境界ステートの経過フレーム
      this.kind = null;     // 'enter' / 'arrive' / 'arrive_top' / 'enter_top'
      this.prom = 0;        // $030D/$032D
    }

    step(world) {
      this.stepper.step(this, world);
    }
  }

  // マリオ・親方 共通移動ステートマシン（$BB78〜 準拠）
  class MarioSpikeStepper {
    canPassWall(slot, b, world) {
      if ((slot.x & 0x0f) !== 0) return true;
      const targetPos = (b & RIGHT) ? ((slot.cr + 1) & 0xff) : ((slot.cr - 1) & 0xff);
      return world.getTile(0x500 + targetPos) !== 8;
    }

    tryEnterLadder(slot, b, world) {
      if ((b & (UP | DOWN)) === 0) return false;
      if (((slot.x + 6) & 0xf) >= 12) return false;
      const row = (slot.cr >> 4) & 0xf;
      const canUp = world.getTile(0x500 + slot.cr) === 1;
      const canDown = row < 7 && world.getTile(0x500 + slot.cr + 0x10) === 1;
      const avail = (canUp ? 2 : 0) | (canDown ? 1 : 0);
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
      return true;
    }

    step(slot, world) {
      slot.cr = (((((slot.y - 32) & 0xff) >> 1) & 0xf0) | (((slot.x + 8) & 0xff) >> 4));
      const b = slot.bits;

      if (slot.state === 0) {
        if (this.tryEnterLadder(slot, b, world)) return;
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          slot.y = (slot.y + 8) & 0xe0;
          if (!this.canPassWall(slot, b, world)) return;
          slot.prom = 0;
          slot.state = 1;
        }
      } else if (slot.state === 1) {
        if (this.tryEnterLadder(slot, b, world)) return;
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
        }
      } else if (slot.state === 2) {
        if (b & (UP | DOWN)) {
          slot.dir = b & (UP | DOWN);
          const d = (slot.dir & DOWN) ? -1 : 1;
          slot.prom += d;
          if (slot.prom >= 32) {
            slot.y = slot.top_y;
            slot.prom = 0;
            slot.state = 3;
            slot.kind = "arrive_top";
            slot.n = 1;
          } else if (slot.prom <= 0) {
            slot.y = (slot.top_y + 32) & 0xff;
            slot.prom = 0;
            slot.state = 3;
            slot.kind = "arrive";
            slot.n = 1;
          } else {
            slot.y = (slot.top_y + relYOfProm(slot.prom)) & 0xff;
          }
          return;
        }
        if (b & (LEFT | RIGHT)) {
          slot.dir = b & (LEFT | RIGHT);
          if (slot.prom < 10) {
            slot.y = (slot.y + 8) & 0xe0;
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
    constructor(inputs = {}, writes = {}) {
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
      else if (addr === 0x329) this.spike.x = val;
      else if (addr === 0x335) this.spike.y = val;
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
        case 0x30f: return m.cr;
        case 0x312: return m.dir;
        case 0x313: return m.top_y;
        case 0x315: return m.y;
        case 0x320: return s.state;
        case 0x328: return s.bits;
        case 0x329: return s.x;
        case 0x32d: return s.prom;
        case 0x32f: return s.cr;
        case 0x332: return s.dir;
        case 0x333: return s.top_y;
        case 0x335: return s.y;
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

  function simulate(script, frames, addrs, writes = "") {
    return new Sim(parseInputs(script), parseWrites(writes)).run(frames, addrs);
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
      const key = JSON.stringify([c.script, c.writes, c.frames]);
      if (!simPlan.has(key)) {
        simPlan.set(key, {
          script: c.script,
          writes: c.writes,
          frames: c.frames,
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
      cache.set(key, simulate(plan.script, plan.frames, sortedAddrs, plan.writes));
    }

    let totalRows = 0;
    let totalLegacy = 0;
    let ng = 0;
    const skippedCols = {};
    const caseResults = [];

    for (const c of data.cases) {
      const key = JSON.stringify([c.script, c.writes, c.frames]);
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