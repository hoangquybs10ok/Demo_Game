"use client";
import React, { useEffect, useState, useRef } from "react";
import { defineHex, Grid, rectangle } from "honeycomb-grid";

const colors = [
  "#ef5350",
  "#42a5f5",
  "#66bb6a",
  "#ffa726",
  "#ab47bc",
  "#26c6da",
  "#d4e157",
  "#8d6e63",
  "#78909c",
  "#f06292",
];

const STONE_COLOR = "#37474f";

interface PlacedBlock {
  id: string;
  q: number;
  r: number;
  color: string;
  type: string;
  direction: number;
  dying?: boolean;
  shaking?: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}

interface GameItem {
  id: string;
  type: "rotate" | "destroy" | "bomb" | "rainbow";
  count: number;
  icon: string;
  unlimited?: boolean;
}

interface BeamEffect {
  id: number;
  x: number;
  y: number;
  color: string;
  life: number;
}

const getNeighbors = (q: number, r: number) => {
  const directions = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  return directions.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
};

const findConnectedGroup = (
  q: number,
  r: number,
  color: string,
  currentPlaced: { [key: string]: PlacedBlock }
) => {
  const group = new Set<string>();
  const queue = [{ q, r }];
  const startKey = `${q},${r}`;

  group.add(startKey);

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const neighbors = getNeighbors(curr.q, curr.r);
    for (const n of neighbors) {
      const key = `${n.q},${n.r}`;
      const block = currentPlaced[key];
      if (
        block &&
        block.type !== "stone" &&
        (block.color === color || block.type === "rainbow") &&
        !group.has(key)
      ) {
        group.add(key);
        queue.push(n);
      }
    }
  }
  return Array.from(group);
};

const findNearestSameColor = (
  startQ: number,
  startR: number,
  color: string,
  placed: { [key: string]: PlacedBlock },
  limit: number
) => {
  const found: string[] = [];
  const visited = new Set<string>();
  const queue = [{ q: startQ, r: startR }];
  visited.add(`${startQ},${startR}`);

  let head = 0;
  while (head < queue.length && found.length < limit) {
    const curr = queue[head++];
    const neighbors = getNeighbors(curr.q, curr.r);
    for (const n of neighbors) {
      const key = `${n.q},${n.r}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const block = placed[key];
      if (
        block &&
        block.color === color &&
        !block.dying &&
        block.type !== "stone"
      ) {
        found.push(key);
        if (found.length >= limit) break;
      }
      queue.push(n);
    }
  }
  return found;
};

const isDeadlock = (
  q: number,
  r: number,
  dir: number,
  placed: { [key: string]: PlacedBlock }
) => {
  if (dir === 0) {
    const b = placed[`${q + 1},${r}`];
    const c = placed[`${q},${r + 1}`];
    if (
      b &&
      b.type !== "stone" &&
      b.direction === 1 &&
      c &&
      c.type !== "stone" &&
      c.direction === 2
    )
      return true;
  } else if (dir === 1) {
    const a = placed[`${q - 1},${r}`];
    const c = placed[`${q - 1},${r + 1}`];
    if (
      a &&
      a.type !== "stone" &&
      a.direction === 0 &&
      c &&
      c.type !== "stone" &&
      c.direction === 2
    )
      return true;
  } else if (dir === 2) {
    const a = placed[`${q},${r - 1}`];
    const b = placed[`${q + 1},${r - 1}`];
    if (
      a &&
      a.type !== "stone" &&
      a.direction === 0 &&
      b &&
      b.type !== "stone" &&
      b.direction === 1
    )
      return true;
  }
  return false;
};

const useDragDrop = (
  grid: Grid<any>,
  placed: { [key: string]: PlacedBlock },
  setPlaced: React.Dispatch<
    React.SetStateAction<{ [key: string]: PlacedBlock }>
  >,
  items: GameItem[],
  setItems: React.Dispatch<React.SetStateAction<GameItem[]>>,
  gameOver: boolean,
  isCustomizing: boolean,
  setScore: React.Dispatch<React.SetStateAction<number>>,
  createExplosion: (q: number, r: number, color: string) => void,
  createBeam: (q: number, r: number, color: string) => void,
  selectedTool: string | null,
  setSelectedTool: React.Dispatch<React.SetStateAction<string | null>>
) => {
  const placedRef = useRef(placed);
  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);

  const [validTargets, setValidTargets] = useState<Set<string>>(new Set());

  const attemptMoveBlock = (
    srcQ: number,
    srcR: number,
    targetQ: number,
    targetR: number
  ) => {
    const srcKey = `${srcQ},${srcR}`;
    const movingBlock = placed[srcKey];
    if (!movingBlock) return;

    const triggerShake = () => {
      setPlaced((prev) => ({
        ...prev,
        [srcKey]: { ...prev[srcKey], shaking: true },
      }));
      setTimeout(() => {
        setPlaced((prev) => {
          if (!prev[srcKey]) return prev;
          return {
            ...prev,
            [srcKey]: { ...prev[srcKey], shaking: false },
          };
        });
      }, 400);
    };

    const dq = targetQ - srcQ;
    const dr = targetR - srcR;
    let isValidMove = false;
    if (movingBlock.direction === 0 && dq === 1 && dr === 0) isValidMove = true;
    if (movingBlock.direction === 1 && dq === -1 && dr === 1)
      isValidMove = true;
    if (movingBlock.direction === 2 && dq === 0 && dr === -1)
      isValidMove = true;

    if (!isValidMove) {
      triggerShake();
      return;
    }

    // Check if target is in grid
    const isInGrid = [...grid].some((h) => h.q === targetQ && h.r === targetR);
    if (!isInGrid) {
      triggerShake();
      return;
    }

    const key = `${targetQ},${targetR}`;
    if (placed[key]) {
      triggerShake();
      return;
    }

    const nextPlaced = { ...placed };
    // Remove from old position
    delete nextPlaced[srcKey];

    if (movingBlock.type === "rainbow") {
      nextPlaced[key] = { ...movingBlock, q: targetQ, r: targetR };
      const neighbors = getNeighbors(targetQ, targetR);
      const neighborColors = new Set<string>();
      neighbors.forEach((n) => {
        const k = `${n.q},${n.r}`;
        const nb = nextPlaced[k];
        if (
          nb &&
          nb.type !== "stone" &&
          nb.type !== "bomb" &&
          nb.type !== "rainbow"
        ) {
          neighborColors.add(nb.color);
        }
      });
      const allMatches = new Set<string>();
      neighborColors.forEach((c) => {
        const matches = findConnectedGroup(targetQ, targetR, c, nextPlaced);
        if (matches.length >= 3) {
          const hasSpecial = matches.some(
            (k) => nextPlaced[k].type === "special"
          );
          if (hasSpecial) {
            Object.entries(nextPlaced).forEach(([k, b]) => {
              if (b.color === c && b.type !== "stone") {
                allMatches.add(k);
                createExplosion(
                  parseInt(k.split(",")[0]),
                  parseInt(k.split(",")[1]),
                  c
                );
              }
            });
          } else {
            matches.forEach((m) => allMatches.add(m));
          }
        }
      });
      if (allMatches.size > 0) {
        allMatches.forEach((k) => {
          if (nextPlaced[k]) nextPlaced[k] = { ...nextPlaced[k], dying: true };
        });
        setScore((prev) => prev + allMatches.size);
      }
      setPlaced(nextPlaced);
      return;
    }

    nextPlaced[key] = { ...movingBlock, q: targetQ, r: targetR };
    const matches = findConnectedGroup(
      targetQ,
      targetR,
      movingBlock.color,
      nextPlaced
    );

    if (matches.length >= 3) {
      const specialBlocks = matches.filter(
        (k) => nextPlaced[k].type === "special"
      );
      if (specialBlocks.length > 0) {
        let destroyed = 0;
        Object.entries(nextPlaced).forEach(([k, b]) => {
          if (b.color === movingBlock.color && b.type !== "stone") {
            const [bq, br] = k.split(",").map(Number);
            createExplosion(bq, br, b.color);
            nextPlaced[k] = { ...nextPlaced[k], dying: true };
            destroyed++;
          }
        });
        setScore((prev) => prev + destroyed);
      } else if (matches.length >= 4) {
        matches.forEach((matchKey) => {
          if (matchKey !== key) {
            const [mq, mr] = matchKey.split(",").map(Number);
            createExplosion(mq, mr, nextPlaced[matchKey].color);
            nextPlaced[matchKey] = { ...nextPlaced[matchKey], dying: true };
          }
        });
        nextPlaced[key] = { ...nextPlaced[key], type: "special" };
        setScore((prev) => prev + matches.length);
      } else {
        matches.forEach((matchKey) => {
          if (nextPlaced[matchKey])
            nextPlaced[matchKey] = { ...nextPlaced[matchKey], dying: true };
        });
        setScore((prev) => prev + matches.length);
      }
    }
    setPlaced(nextPlaced);
  };

  const handleMapBlockDragStart = (
    e: React.DragEvent,
    q: number,
    r: number
  ) => {
    if (isCustomizing || gameOver) {
      e.preventDefault();
      return;
    }

    const key = `${q},${r}`;
    const block = placed[key];
    if (block && (block.type === "stone" || block.type === "rainbow")) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData("mapBlock", JSON.stringify({ q, r }));

    if (block) {
      let dq = 0,
        dr = 0;
      if (block.direction === 0) {
        dq = 1;
        dr = 0;
      } else if (block.direction === 1) {
        dq = -1;
        dr = 1;
      } else if (block.direction === 2) {
        dq = 0;
        dr = -1;
      }

      const targetKey = `${q + dq},${r + dr}`;
      if (!placed[targetKey]) {
        setValidTargets(new Set([targetKey]));
      }
    }
  };

  const handleDragEnd = () => {
    setValidTargets(new Set());
  };

  const handleDrop = (
    e: React.DragEvent<SVGPolygonElement>,
    q: number,
    r: number
  ) => {
    if (isCustomizing) return;
    if (gameOver) return;

    const mapBlockData = e.dataTransfer.getData("mapBlock");
    if (mapBlockData) {
      const { q: srcQ, r: srcR } = JSON.parse(mapBlockData);
      attemptMoveBlock(srcQ, srcR, q, r);
      return;
    }

    const id = e.dataTransfer.getData("itemId");
    const item = items.find((i) => i.id === id);
    if (!item || (!item.unlimited && item.count <= 0)) return;

    const key = `${q},${r}`;
    const targetBlock = placed[key];

    // Handle Tools (Left Compartment)
    if (item.type === "rotate") {
      if (targetBlock && targetBlock.type !== "stone") {
        setPlaced((prev) => ({
          ...prev,
          [key]: { ...prev[key], direction: (prev[key].direction + 1) % 3 },
        }));
        setItems((prev) =>
          prev.map((i) =>
            i.id === id && !i.unlimited ? { ...i, count: i.count - 1 } : i
          )
        );
      }
      return;
    }

    if (item.type === "destroy") {
      if (targetBlock && targetBlock.type !== "stone") {
        const nextPlaced = { ...placed };

        // Destroy target
        createExplosion(q, r, targetBlock.color);
        createBeam(q, r, targetBlock.color);
        nextPlaced[key] = { ...nextPlaced[key], dying: true };

        // Find and destroy 2 nearest same color
        const nearest = findNearestSameColor(
          q,
          r,
          targetBlock.color,
          nextPlaced,
          2
        );
        nearest.forEach((nKey) => {
          const [nq, nr] = nKey.split(",").map(Number);
          createExplosion(nq, nr, nextPlaced[nKey].color);
          createBeam(nq, nr, nextPlaced[nKey].color);
          nextPlaced[nKey] = { ...nextPlaced[nKey], dying: true };
        });

        setPlaced(nextPlaced);
        setScore((prev) => prev + 1 + nearest.length);
        setItems((prev) =>
          prev.map((i) =>
            i.id === id && !i.unlimited ? { ...i, count: i.count - 1 } : i
          )
        );
      }
      return;
    }

    // Handle Special Blocks (Right Compartment)
    if (item.type === "bomb") {
      // 1. Place visually first
      const bombId = `bomb-${Date.now()}`;
      setPlaced((prev) => ({
        ...prev,
        [`${q},${r}`]: {
          id: bombId,
          q,
          r,
          color: "#000000",
          type: "bomb",
          direction: 0,
        },
      }));
      setItems((prev) =>
        prev.map((i) =>
          i.id === id && !i.unlimited ? { ...i, count: i.count - 1 } : i
        )
      );

      // 2. Delay execution
      setTimeout(() => {
        const currentPlaced = placedRef.current;
        const neighbors = getNeighbors(q, r);
        const targets = [{ q, r }, ...neighbors];
        const nextPlaced = { ...currentPlaced };
        let destroyed = 0;

        targets.forEach((t) => {
          const k = `${t.q},${t.r}`;
          if (nextPlaced[k]) {
            createExplosion(t.q, t.r, nextPlaced[k].color);
            if (k === `${q},${r}`) delete nextPlaced[k]; // Remove bomb itself
            else nextPlaced[k] = { ...nextPlaced[k], dying: true };
            destroyed++;
          }
        });
        createExplosion(q, r, "#ffa726");

        setPlaced(nextPlaced);
        setScore((prev) => prev + destroyed);
      }, 500);
      return;
    }

    if (item.type === "rainbow") {
      if (targetBlock) return; // Rainbow needs empty space

      // 1. Place visually first
      const rainbowId = `rainbow-${Date.now()}`;
      setPlaced((prev) => ({
        ...prev,
        [key]: {
          id: rainbowId,
          q,
          r,
          color: "rainbow",
          type: "rainbow",
          direction: 0,
        },
      }));
      setItems((prev) =>
        prev.map((i) =>
          i.id === id && !i.unlimited ? { ...i, count: i.count - 1 } : i
        )
      );

      // 2. Delay execution
      setTimeout(() => {
        const currentPlaced = placedRef.current;
        const nextPlaced = { ...currentPlaced };
        const neighbors = getNeighbors(q, r);
        const neighborColors = new Set<string>();

        neighbors.forEach((n) => {
          const k = `${n.q},${n.r}`;
          const nb = nextPlaced[k];
          if (
            nb &&
            nb.type !== "stone" &&
            nb.type !== "bomb" &&
            nb.type !== "rainbow"
          ) {
            neighborColors.add(nb.color);
          }
        });

        const allMatches = new Set<string>();
        neighborColors.forEach((c) => {
          const matches = findConnectedGroup(q, r, c, nextPlaced);
          if (matches.length >= 3) {
            const hasSpecial = matches.some(
              (k) => nextPlaced[k].type === "special"
            );
            if (hasSpecial) {
              Object.entries(nextPlaced).forEach(([k, b]) => {
                if (b.color === c && b.type !== "stone") {
                  allMatches.add(k);
                  createExplosion(
                    parseInt(k.split(",")[0]),
                    parseInt(k.split(",")[1]),
                    c
                  );
                }
              });
            } else {
              matches.forEach((m) => allMatches.add(m));
            }
          }
        });

        if (allMatches.size > 0) {
          allMatches.forEach((k) => {
            if (nextPlaced[k])
              nextPlaced[k] = { ...nextPlaced[k], dying: true };
          });
          setScore((prev) => prev + allMatches.size);
        }
        setPlaced(nextPlaced);
      }, 500);
      return;
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (isCustomizing) {
      e.preventDefault();
      return;
    }
    if (gameOver) return;
    e.dataTransfer.setData("itemId", id);

    const item = items.find((i) => i.id === id);
    if (item) {
      const newValidTargets = new Set<string>();
      if (item.type === "rotate" || item.type === "destroy") {
        // Tools target existing blocks
        Object.values(placed).forEach((b) => {
          if (b.type !== "stone") newValidTargets.add(`${b.q},${b.r}`);
        });
      } else if (item.type === "bomb") {
        // Bomb targets anywhere
        [...grid].forEach((hex) => newValidTargets.add(`${hex.q},${hex.r}`));
      } else if (item.type === "rainbow") {
        // Rainbow targets empty cells
        [...grid].forEach((hex) => {
          if (!placed[`${hex.q},${hex.r}`])
            newValidTargets.add(`${hex.q},${hex.r}`);
        });
      }
      setValidTargets(newValidTargets);
    }
  };

  return {
    validTargets,
    handleDragStart,
    handleMapBlockDragStart,
    handleDragEnd,
    handleDrop,
    attemptMoveBlock,
  };
};

export default function DemoPage() {
  const [mapSize, setMapSize] = useState(10);
  const Hex = defineHex({ dimensions: 30 });
  const grid = new Grid(Hex, rectangle({ width: mapSize, height: mapSize }));

  const [useSpecialBlocks, setUseSpecialBlocks] = useState(true);
  const [difficulty, setDifficulty] = useState("medium");
  const [unlimitedItems, setUnlimitedItems] = useState(false);

  const getActiveColors = (diff: string) => {
    const count = diff === "easy" ? 4 : diff === "medium" ? 6 : 10;
    return colors.slice(0, count);
  };

  const generateMap = () => {
    const newPlaced: { [key: string]: PlacedBlock } = {};
    const allHexes = [...grid];
    const totalHexes = allHexes.length;

    const stoneCount = Math.floor(totalHexes * 0.1); // 10% stones
    const availableHexes = totalHexes - stoneCount;
    const targetBlockCount = Math.floor(availableHexes * 0.7); // 70% fill

    const shuffled = [...allHexes].sort(() => 0.5 - Math.random());

    shuffled.slice(0, stoneCount).forEach((hex) => {
      newPlaced[`${hex.q},${hex.r}`] = {
        id: `stone-${hex.q}-${hex.r}`,
        q: hex.q,
        r: hex.r,
        color: STONE_COLOR,
        type: "stone",
        direction: 0,
      };
    });

    let activeColors = getActiveColors(difficulty);

    // Ensure we don't have more colors than we can fit sets of 3 within the target block count
    const maxColors = Math.floor(targetBlockCount / 3);
    if (activeColors.length > maxColors) {
      activeColors = activeColors
        .sort(() => 0.5 - Math.random())
        .slice(0, maxColors);
    }

    // Calculate blocks per color (divisible by 3)
    let countPerColor = Math.floor(targetBlockCount / activeColors.length);
    countPerColor = countPerColor - (countPerColor % 3);
    if (countPerColor === 0) countPerColor = 3;

    const colorPool: string[] = [];
    activeColors.forEach((c) => {
      for (let i = 0; i < countPerColor; i++) colorPool.push(c);
    });

    const shuffledPool = colorPool.sort(() => 0.5 - Math.random());
    const emptyHexes = shuffled.slice(stoneCount);

    for (let i = 0; i < shuffledPool.length && i < emptyHexes.length; i++) {
      const hex = emptyHexes[i];
      const item = shuffledPool[i];
      let type = "normal";
      let color = item;
      if (item === "BOMB") {
        type = "bomb";
        color = "#000000";
      } else if (item === "RAINBOW") {
        type = "rainbow";
        color = "rainbow";
      }

      let direction = Math.floor(Math.random() * 3);
      const startDir = direction;
      for (let d = 0; d < 3; d++) {
        const currentDir = (startDir + d) % 3;
        if (!isDeadlock(hex.q, hex.r, currentDir, newPlaced)) {
          direction = currentDir;
          break;
        }
      }

      newPlaced[`${hex.q},${hex.r}`] = {
        id: `init-${hex.q}-${hex.r}`,
        q: hex.q,
        r: hex.r,
        color,
        type,
        direction,
      };
    }
    return newPlaced;
  };

  const [placed, setPlaced] = useState<{ [key: string]: PlacedBlock }>({});
  const [score, setScore] = useState(0);
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [tool, setTool] = useState<{ type: string; color: string } | null>(
    null
  );
  const [showTutorial, setShowTutorial] = useState(false);
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);
  const [items, setItems] = useState<GameItem[]>([]);
  const [beams, setBeams] = useState<BeamEffect[]>([]);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);

  const hexWidth = Math.sqrt(3) * 30;
  const hexHeight = 2 * 30;
  const boardPixelWidth = mapSize * hexWidth + 80;
  const boardPixelHeight = mapSize * (hexHeight * 0.75) + 80;

  useEffect(() => {
    handleReset();
  }, [difficulty, useSpecialBlocks, isChallengeMode, mapSize, unlimitedItems]);

  useEffect(() => {
    if (!isChallengeMode || gameOver) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isChallengeMode, gameOver]);

  // Cleanup dying blocks
  useEffect(() => {
    const dyingBlocks = Object.values(placed).filter((b) => b.dying);
    if (dyingBlocks.length > 0) {
      const timer = setTimeout(() => {
        const nextPlaced = { ...placed };
        dyingBlocks.forEach((b) => delete nextPlaced[`${b.q},${b.r}`]);
        setPlaced(nextPlaced);
      }, 300); // Animation duration
      return () => clearTimeout(timer);
    }
  }, [placed]);

  useEffect(() => {
    const hasSeen = localStorage.getItem("hasSeenTutorial");
    if (!hasSeen) {
      setShowTutorial(true);
    }
  }, []);

  useEffect(() => {
    if (particles.length === 0) return;
    const timer = requestAnimationFrame(() => {
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            life: p.life - 0.05,
          }))
          .filter((p) => p.life > 0)
      );
    });
    return () => cancelAnimationFrame(timer);
  }, [particles]);

  useEffect(() => {
    if (beams.length === 0) return;
    const timer = requestAnimationFrame(() => {
      setBeams((prev) =>
        prev
          .map((b) => ({
            ...b,
            life: b.life - 0.05,
          }))
          .filter((b) => b.life > 0)
      );
    });
    return () => cancelAnimationFrame(timer);
  }, [beams]);

  useEffect(() => {
    const isTimeOut = isChallengeMode && timeLeft === 0;

    if (isTimeOut) {
      setGameOver(true);
    } else {
      setGameOver(false);
    }
  }, [timeLeft, isChallengeMode]);

  const createExplosion = (q: number, r: number, color: string) => {
    const hex = new Hex({ q, r });
    const cx = hex.x + 40;
    const cy = hex.y + 40;
    const newParticles: Particle[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      newParticles.push({
        id: Math.random(),
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 1.0,
      });
    }
    setParticles((prev) => [...prev, ...newParticles]);
  };

  const createBeam = (q: number, r: number, color: string) => {
    const hex = new Hex({ q, r });
    setBeams((prev) => [
      ...prev,
      {
        id: Math.random(),
        x: hex.x + 40,
        y: hex.y + 40,
        color,
        life: 1.0,
      },
    ]);
  };

  const {
    validTargets,
    handleDragStart,
    handleMapBlockDragStart,
    handleDragEnd,
    handleDrop,
    attemptMoveBlock,
  } = useDragDrop(
    grid,
    placed,
    setPlaced,
    items,
    setItems,
    gameOver,
    isCustomizing,
    setScore,
    createExplosion,
    createBeam,
    selectedTool,
    setSelectedTool
  );

  const handleHexClick = (q: number, r: number) => {
    if (selectedTool) {
      const key = `${q},${r}`;
      const targetBlock = placed[key];

      if (selectedTool === "rotate") {
        if (targetBlock && targetBlock.type !== "stone") {
          setPlaced((prev) => ({
            ...prev,
            [key]: { ...prev[key], direction: (prev[key].direction + 1) % 3 },
          }));
          setItems((prev) =>
            prev.map((i) =>
              i.type === "rotate" && !i.unlimited
                ? { ...i, count: i.count - 1 }
                : i
            )
          );
          setSelectedTool(null);
        }
        return;
      }

      if (selectedTool === "destroy") {
        if (targetBlock && targetBlock.type !== "stone") {
          const nextPlaced = { ...placed };

          // Destroy target
          createExplosion(q, r, targetBlock.color);
          createBeam(q, r, targetBlock.color);
          nextPlaced[key] = { ...nextPlaced[key], dying: true };

          // Find and destroy 2 nearest same color
          const nearest = findNearestSameColor(
            q,
            r,
            targetBlock.color,
            nextPlaced,
            2
          );
          nearest.forEach((nKey) => {
            const [nq, nr] = nKey.split(",").map(Number);
            createExplosion(nq, nr, nextPlaced[nKey].color);
            createBeam(nq, nr, nextPlaced[nKey].color);
            nextPlaced[nKey] = { ...nextPlaced[nKey], dying: true };
          });

          setPlaced(nextPlaced);
          setScore((prev) => prev + 1 + nearest.length);
          setItems((prev) =>
            prev.map((i) =>
              i.type === "destroy" && !i.unlimited
                ? { ...i, count: i.count - 1 }
                : i
            )
          );
          setSelectedTool(null);
        }
        return;
      }
    }

    if (isCustomizing) {
      const key = `${q},${r}`;
      const newPlaced = { ...placed };
      if (tool) {
        newPlaced[key] = {
          id: Math.random().toString(36).substr(2, 9),
          q,
          r,
          color: tool.color,
          type: tool.type,
          direction: Math.floor(Math.random() * 3),
        };
      } else {
        delete newPlaced[key];
      }
      setPlaced(newPlaced);
      return;
    }

    if (gameOver) return;
    const key = `${q},${r}`;
    const block = placed[key];
    if (block) {
      if (block.type === "stone" || block.type === "rainbow") {
        setPlaced((prev) => ({
          ...prev,
          [key]: { ...prev[key], shaking: true },
        }));
        setTimeout(() => {
          setPlaced((prev) => {
            if (!prev[key]) return prev;
            return { ...prev, [key]: { ...prev[key], shaking: false } };
          });
        }, 400);
      } else {
        let dq = 0,
          dr = 0;
        if (block.direction === 0) {
          dq = 1;
          dr = 0;
        } else if (block.direction === 1) {
          dq = -1;
          dr = 1;
        } else if (block.direction === 2) {
          dq = 0;
          dr = -1;
        }
        attemptMoveBlock(q, r, q + dq, r + dr);
      }
    }
  };

  const handleReset = () => {
    const newPlaced = generateMap();
    setPlaced(newPlaced);
    setItems([
      {
        id: "tool-rotate",
        type: "rotate",
        count: 3,
        icon: "↻",
        unlimited: unlimitedItems,
      },
      {
        id: "tool-destroy",
        type: "destroy",
        count: 3,
        icon: "✖",
        unlimited: unlimitedItems,
      },
      {
        id: "block-bomb",
        type: "bomb",
        count: 3,
        icon: "💣",
        unlimited: unlimitedItems,
      },
      {
        id: "block-rainbow",
        type: "rainbow",
        count: 3,
        icon: "🌈",
        unlimited: unlimitedItems,
      },
    ]);
    setScore(0);
    setGameOver(false);
    setIsCustomizing(false);
    setTimeLeft(180);
    setSelectedTool(null);
  };

  const handleCloseTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem("hasSeenTutorial", "true");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100vh",
        background: "#111827",
        color: "white",
        overflow: "hidden",
      }}
      onClick={() => selectedTool && setSelectedTool(null)}
    >
      <style>{`
        @keyframes dropIn {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .hex-placed {
          animation: dropIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          transform-box: fill-box;
          transform-origin: center;
        }
        .rainbow-fill {
          fill: url(#rainbowGradient);
        }
        @keyframes shake {
          0% { transform: translate(0, 0); }
          25% { transform: translate(-3px, 0) rotate(-3deg); }
          50% { transform: translate(3px, 0) rotate(3deg); }
          75% { transform: translate(-3px, 0) rotate(-3deg); }
          100% { transform: translate(0, 0); }
        }
        .shake-element {
          animation: shake 0.4s ease-in-out;
          transform-origin: center;
        }
        @keyframes flash {
          0%, 100% { opacity: 1; filter: brightness(1); }
          50% { opacity: 0.7; filter: brightness(1.5); }
        }
        .flash-element {
          animation: flash 1s infinite;
        }
      `}</style>
      <div
        style={{
          flex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 40,
            marginBottom: 20,
            fontSize: "1.5rem",
            fontWeight: "bold",
          }}
        >
          <div>Score: {score}</div>
          {isChallengeMode && (
            <div style={{ color: timeLeft < 30 ? "#ef5350" : "#66bb6a" }}>
              Time: {formatTime(timeLeft)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Grid */}
            <div
              style={{
                position: "relative",
                maxWidth: "100%",
                maxHeight: "80vh",
                overflow: "auto",
                borderRadius: "8px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
            >
              <svg
                width={boardPixelWidth}
                height={boardPixelHeight}
                viewBox={`0 0 ${boardPixelWidth} ${boardPixelHeight}`}
                style={{
                  background: "#1b2026",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <defs>
                  <linearGradient
                    id="rainbowGradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#ff0000" />
                    <stop offset="20%" stopColor="#ffff00" />
                    <stop offset="40%" stopColor="#00ff00" />
                    <stop offset="60%" stopColor="#00ffff" />
                    <stop offset="80%" stopColor="#0000ff" />
                    <stop offset="100%" stopColor="#ff00ff" />
                  </linearGradient>
                </defs>
                {[...grid].map((hex, i) => {
                  const points = hex.corners
                    .map((p) => `${p.x + 40},${p.y + 40}`)
                    .join(" ");
                  const key = `${hex.q},${hex.r}`;
                  const isHovered = hoveredHex === key;
                  const isValidTarget = validTargets.has(key);
                  // Only render background/stroke here. Blocks are rendered separately.
                  return (
                    <g key={i}>
                      <polygon
                        points={points}
                        fill="#2a3240"
                        stroke={
                          isHovered
                            ? "#fdd835"
                            : isValidTarget
                            ? "#66bb6a"
                            : "#6dd1ff"
                        }
                        strokeWidth={isHovered || isValidTarget ? 3 : 1.5}
                        strokeDasharray={isValidTarget ? "4" : "none"}
                        {...({ draggable: false } as any)}
                        onDragStart={(e) =>
                          handleMapBlockDragStart(e, hex.q, hex.r)
                        }
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, hex.q, hex.r)}
                        onMouseEnter={() => setHoveredHex(key)}
                        onMouseLeave={() => setHoveredHex(null)}
                        onClick={() => handleHexClick(hex.q, hex.r)}
                        style={{
                          transition:
                            "stroke 0.2s ease, stroke-width 0.2s ease",
                        }}
                      />
                    </g>
                  );
                })}
                {/* Render Blocks Layer */}
                {Object.values(placed).map((block) => {
                  const hex = grid.getHex({ q: block.q, r: block.r });
                  if (!hex) return null;
                  const points = hex.corners
                    .map((p) => `${p.x + 40},${p.y + 40}`)
                    .join(" ");
                  const fill =
                    block.type === "rainbow"
                      ? "url(#rainbowGradient)"
                      : block.color;
                  const isTargetable = selectedTool && block.type !== "stone";
                  return (
                    <g
                      key={block.id}
                      style={{
                        transform: `translate(${hex.x}px, ${hex.y}px)`, // Use translate for movement
                        transition:
                          "transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-out, transform-origin 0.3s",
                        opacity: block.dying ? 0 : 1,
                        transformOrigin: "center",
                        scale: block.dying ? "0.5" : "1",
                        pointerEvents: block.dying ? "none" : "auto",
                        cursor:
                          selectedTool && block.type !== "stone"
                            ? "crosshair"
                            : block.type !== "stone" && block.type !== "rainbow"
                            ? "pointer"
                            : "default",
                      }}
                      {...({
                        draggable:
                          block.type !== "stone" && block.type !== "rainbow",
                      } as any)}
                      onDragStart={(e) =>
                        handleMapBlockDragStart(e, block.q, block.r)
                      }
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleHexClick(block.q, block.r);
                      }}
                    >
                      <g
                        className={`${block.shaking ? "shake-element" : ""} ${
                          isTargetable ? "flash-element" : ""
                        }`}
                      >
                        {/* We use a group with negative offset to center the polygon at 0,0 relative to the group, 
                  but since points are already offset by +40,+40, we need to adjust. 
                  Actually, the points are absolute relative to grid 0,0. 
                  To use translate(hex.x, hex.y), we should render polygon points relative to 0,0.
                  Let's recalculate points relative to hex center or top-left.
              */}
                        <polygon
                          points={hex.corners
                            .map(
                              (p) => `${p.x - hex.x + 40},${p.y - hex.y + 40}`
                            )
                            .join(" ")}
                          fill={fill}
                          className="hex-placed"
                        />
                        {block.type !== "stone" && (
                          <g
                            transform={`translate(40, 40)`}
                            style={{ pointerEvents: "none" }}
                          >
                            {block.type === "special" ? (
                              <text
                                x={0}
                                y={0}
                                dy=".35em"
                                textAnchor="middle"
                                fill="white"
                                fontSize="24"
                                fontWeight="bold"
                              >
                                ★
                              </text>
                            ) : block.type === "bomb" ? (
                              <text
                                x={0}
                                y={0}
                                dy=".35em"
                                textAnchor="middle"
                                fontSize="24"
                              >
                                💣
                              </text>
                            ) : block.type !== "rainbow" ? (
                              <g transform={`rotate(${block.direction * 120})`}>
                                <line
                                  x1={-10}
                                  y1={0}
                                  x2={10}
                                  y2={0}
                                  stroke="white"
                                  strokeWidth={2}
                                />
                                <path
                                  d="M 5 -5 L 10 0 L 5 5"
                                  fill="none"
                                  stroke="white"
                                  strokeWidth={2}
                                />
                              </g>
                            ) : null}
                          </g>
                        )}
                      </g>
                    </g>
                  );
                })}
                {particles.map((p) => (
                  <circle
                    key={p.id}
                    cx={p.x}
                    cy={p.y}
                    r={5 * p.life}
                    fill={p.color}
                    opacity={p.life}
                    style={{ pointerEvents: "none" }}
                  />
                ))}
                {beams.map((b) => (
                  <g key={b.id} style={{ pointerEvents: "none" }}>
                    <line
                      x1={b.x}
                      y1={0}
                      x2={b.x}
                      y2={b.y}
                      stroke={b.color}
                      strokeWidth={30 * b.life}
                      strokeOpacity={0.4 * b.life}
                      strokeLinecap="round"
                      style={{ filter: "blur(8px)" }}
                    />
                    <line
                      x1={b.x}
                      y1={0}
                      x2={b.x}
                      y2={b.y}
                      stroke="white"
                      strokeWidth={8 * b.life}
                      strokeOpacity={0.8 * b.life}
                      strokeLinecap="round"
                      style={{ filter: "blur(2px)" }}
                    />
                    <circle
                      cx={b.x}
                      cy={b.y}
                      r={30 * (1.2 - b.life)}
                      fill="white"
                      fillOpacity={b.life}
                      style={{ filter: "blur(6px)" }}
                    />
                  </g>
                ))}
              </svg>
              {showTutorial && (
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    background: "rgba(0,0,0,0.85)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 100,
                  }}
                >
                  <div
                    style={{
                      background: "#1f2937",
                      padding: "30px",
                      borderRadius: "12px",
                      maxWidth: "500px",
                      color: "white",
                      border: "1px solid #4b5563",
                      boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: "2rem",
                        marginBottom: "20px",
                        color: "#66bb6a",
                        textAlign: "center",
                      }}
                    >
                      How to Play
                    </h2>
                    <ul
                      style={{
                        lineHeight: "1.8",
                        fontSize: "1.1rem",
                        paddingLeft: "20px",
                        listStyleType: "disc",
                      }}
                    >
                      <li>
                        <strong>Goal:</strong> Drag blocks to the grid to match{" "}
                        <strong>3 or more</strong> of the same color.
                      </li>
                      <li>
                        <strong>Controls:</strong> Drag to place. Click a block
                        in the queue to <strong>rotate</strong>.
                      </li>
                      <li>
                        <strong>Special Blocks:</strong>
                        <ul
                          style={{
                            marginTop: "5px",
                            marginBottom: "5px",
                            listStyleType: "circle",
                            paddingLeft: "20px",
                          }}
                        >
                          <li>
                            💣 <strong>Bomb:</strong> Destroys surrounding
                            blocks.
                          </li>
                          <li>
                            🌈 <strong>Rainbow:</strong> Matches with any color.
                          </li>
                        </ul>
                      </li>
                      <li>
                        <strong>Game Over:</strong> When the grid is full or you
                        run out of moves.
                      </li>
                    </ul>
                    <button
                      onClick={handleCloseTutorial}
                      style={{
                        marginTop: "25px",
                        padding: "12px 20px",
                        fontSize: "1.2rem",
                        background: "#42a5f5",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        width: "100%",
                        fontWeight: "bold",
                      }}
                    >
                      Got it!
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Special Items & Blocks Queue */}
            {selectedTool && (
              <div
                style={{
                  position: "absolute",
                  top: -40,
                  left: "50%",
                  transform: "translateX(-50%)",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTool(null);
                  }}
                  style={{
                    background: "#ef5350",
                    color: "white",
                    border: "none",
                    padding: "5px 10px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
                  }}
                >
                  Cancel Tool
                </button>
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 20,
                width: "100%",
                justifyContent: "center",
              }}
            >
              {/* Left Compartment: Tools */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 10,
                  background: "#1f2937",
                  borderRadius: 8,
                  border: "1px solid #4b5563",
                }}
              >
                {items
                  .filter((i) => i.type === "rotate" || i.type === "destroy")
                  .map((item) => (
                    <div
                      key={item.id}
                      draggable={item.unlimited || item.count > 0}
                      onDragStart={(e) => handleDragStart(e, item.id)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.unlimited || item.count > 0) {
                          setSelectedTool((prev) =>
                            prev === item.type ? null : item.type
                          );
                        }
                      }}
                      style={{
                        width: 50,
                        height: 50,
                        background:
                          selectedTool === item.type ? "#4caf50" : "#374151",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "24px",
                        cursor:
                          item.unlimited || item.count > 0
                            ? "pointer"
                            : "default",
                        opacity: item.unlimited || item.count > 0 ? 1 : 0.5,
                        position: "relative",
                        border:
                          selectedTool === item.type
                            ? "2px solid white"
                            : "2px solid #66bb6a",
                        transition: "background 0.2s",
                      }}
                      title={
                        item.type === "rotate"
                          ? "Rotate Block"
                          : "Destroy Block + 2 Nearest"
                      }
                    >
                      {item.icon}
                      <span
                        style={{
                          position: "absolute",
                          bottom: -5,
                          right: -5,
                          background: "#ef5350",
                          borderRadius: "50%",
                          width: 20,
                          height: 20,
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {item.unlimited ? "∞" : item.count}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Right Compartment: Special Blocks */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 10,
                  background: "#1f2937",
                  borderRadius: 8,
                  border: "1px solid #4b5563",
                }}
              >
                {items
                  .filter((i) => i.type === "bomb" || i.type === "rainbow")
                  .map((item) => (
                    <div
                      key={item.id}
                      draggable={item.unlimited || item.count > 0}
                      onDragStart={(e) => handleDragStart(e, item.id)}
                      onDragEnd={handleDragEnd}
                      style={{
                        width: 50,
                        height: 50,
                        background: "#374151",
                        borderRadius: 8,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "24px",
                        cursor:
                          item.unlimited || item.count > 0 ? "grab" : "default",
                        opacity: item.unlimited || item.count > 0 ? 1 : 0.5,
                        position: "relative",
                        border: "2px solid #42a5f5",
                      }}
                      title={
                        item.type === "bomb" ? "Bomb Block" : "Rainbow Block"
                      }
                    >
                      {item.icon}
                      <span
                        style={{
                          position: "absolute",
                          bottom: -5,
                          right: -5,
                          background: "#ef5350",
                          borderRadius: "50%",
                          width: 20,
                          height: 20,
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {item.unlimited ? "∞" : item.count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {gameOver && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,0.8)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
              borderRadius: 8,
            }}
          >
            <h2 style={{ fontSize: "3rem", color: "#ef5350", margin: 0 }}>
              GAME OVER
            </h2>
            <p style={{ fontSize: "1.5rem", color: "white", margin: "10px 0" }}>
              Final Score: {score}
            </p>
            <button
              onClick={handleReset}
              style={{
                padding: "10px 20px",
                fontSize: "1.2rem",
                background: "#42a5f5",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Queue */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          padding: 40,
          borderLeft: "1px solid #374151",
          overflowY: "auto",
          background: "#1f2937",
        }}
      >
        {/* Settings Section */}
        <div style={{ background: "#1f2937", padding: 15, borderRadius: 8 }}>
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: "bold",
              marginBottom: 15,
              color: "#66bb6a",
            }}
          >
            Game Settings
          </h3>

          <div style={{ marginBottom: 15 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
                color: "#9ca3af",
                fontSize: "0.9rem",
              }}
            >
              Functional Blocks
            </label>
            <div style={{ display: "flex", gap: 20 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={useSpecialBlocks}
                  onChange={() => setUseSpecialBlocks(true)}
                />
                Enable
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={!useSpecialBlocks}
                  onChange={() => setUseSpecialBlocks(false)}
                />
                Disable
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 15 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
                color: "#9ca3af",
                fontSize: "0.9rem",
              }}
            >
              Item Usage
            </label>
            <div style={{ display: "flex", gap: 20 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={!unlimitedItems}
                  onChange={() => setUnlimitedItems(false)}
                />
                Limited
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={unlimitedItems}
                  onChange={() => setUnlimitedItems(true)}
                />
                Unlimited
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 15 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
                color: "#9ca3af",
                fontSize: "0.9rem",
              }}
            >
              Challenge Mode
            </label>
            <div style={{ display: "flex", gap: 20 }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={isChallengeMode}
                  onChange={() => setIsChallengeMode(true)}
                />
                On (Timer)
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  checked={!isChallengeMode}
                  onChange={() => setIsChallengeMode(false)}
                />
                Off
              </label>
            </div>
          </div>

          <div style={{ marginBottom: 15 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
                color: "#9ca3af",
                fontSize: "0.9rem",
              }}
            >
              Map Size
            </label>
            <div style={{ display: "flex", gap: 20 }}>
              {[5, 7, 9, 11, 13, 15].map((s) => (
                <label
                  key={s}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    checked={mapSize === s}
                    onChange={() => setMapSize(s)}
                  />
                  {s}x{s}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
                color: "#9ca3af",
                fontSize: "0.9rem",
              }}
            >
              Difficulty
            </label>
            <div style={{ display: "flex", gap: 20 }}>
              {["easy", "medium", "hard"].map((d) => (
                <label
                  key={d}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  <input
                    type="radio"
                    checked={difficulty === d}
                    onChange={() => setDifficulty(d)}
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            if (isCustomizing) {
              setIsCustomizing(false);
            } else {
              setIsCustomizing(true);
            }
          }}
          style={{
            padding: "8px 16px",
            border: "none",
            borderRadius: "4px",
            background: isCustomizing ? "#42a5f5" : "#ab47bc",
            color: "white",
            cursor: "pointer",
            fontWeight: "bold",
            width: "100%",
            marginBottom: 10,
          }}
        >
          {isCustomizing ? "Save & Play" : "Custom Map"}
        </button>

        <button
          onClick={handleReset}
          style={{
            padding: "8px 16px",
            border: "none",
            borderRadius: "4px",
            background: "#ef5350",
            color: "white",
            cursor: "pointer",
            fontWeight: "bold",
            width: "100%",
          }}
        >
          Reset
        </button>

        {isCustomizing && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 5,
              marginBottom: 10,
              width: 200,
              justifyContent: "center",
            }}
          >
            <div
              onClick={() => setTool(null)}
              style={{
                width: 30,
                height: 30,
                border: "1px solid white",
                cursor: "pointer",
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ❌
            </div>
            <div
              onClick={() => setTool({ type: "stone", color: STONE_COLOR })}
              style={{
                width: 30,
                height: 30,
                border: "1px solid white",
                cursor: "pointer",
                background: STONE_COLOR,
              }}
            ></div>
            <div
              onClick={() => setTool({ type: "rainbow", color: "rainbow" })}
              style={{
                width: 30,
                height: 30,
                border: "1px solid white",
                cursor: "pointer",
                background:
                  "linear-gradient(45deg, red, yellow, green, blue, purple)",
              }}
            ></div>
            {getActiveColors(difficulty).map((c) => (
              <div
                key={c}
                onClick={() => setTool({ type: "normal", color: c })}
                style={{
                  width: 30,
                  height: 30,
                  border: "1px solid white",
                  cursor: "pointer",
                  background: c,
                }}
              ></div>
            ))}
            <div
              style={{
                width: "100%",
                textAlign: "center",
                fontSize: "0.8rem",
                marginTop: 5,
              }}
            >
              Selected:{" "}
              {tool ? (tool.type === "stone" ? "Stone" : "Block") : "Eraser"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
