import React, { useState, useEffect, useRef } from "react";

type PetState = "idle" | "walk" | "run" | "sit" | "sleep" | "drag" | "fall";
type PetDirection = "left" | "right";

interface Particle {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  dr: number;
  type: "heart" | "zzz";
}

export default function DigitalPet() {
  // Dimension config
  const petWidth = 96;
  const petHeight = 96;

  // Physics States
  const [pos, setPos] = useState({ x: 100, y: 300 });
  const [state, setState] = useState<PetState>("idle");
  const [direction, setDirection] = useState<PetDirection>("right");

  // Interactive states
  const [showBark, setShowBark] = useState(false);
  const [barkText, setBarkText] = useState("Woof!");
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Refs for tracking values inside physics animation loop
  const posRef = useRef({ x: 100, y: 300 });
  const velRef = useRef({ x: 0, y: 0 });
  const stateRef = useRef<PetState>("idle");
  const directionRef = useRef<PetDirection>("right");
  const targetXRef = useRef<number | null>(null);
  const targetYRef = useRef<number | null>(null);
  const seekCornerAfterLandingRef = useRef(false);
  const lastMouseMoveTimeRef = useRef(Date.now());
  
  // Dragging state tracking refs (avoids react state delays in loop)
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Active vertical floor plane
  const restingYRef = useRef<number>(600);

  // Random behavior timers
  const decisionTimerRef = useRef<number | null>(null);
  const barkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const particleIdRef = useRef(0);

  // Constants
  const gravity = 0.5;
  const airFriction = 0.98;
  const groundFriction = 0.82;
  const bounce = 0.25;
  const walkSpeed = 1.3;
  const runSpeed = 3.5;

  // Helper to check target boundaries
  const getBounds = () => {
    if (typeof window === "undefined") return { maxX: 800, maxY: 600 };
    return {
      maxX: window.innerWidth - petWidth,
      maxY: window.innerHeight - petHeight - 4, // 4px buffer from bottom edge
    };
  };

  // Trigger bubble bark
  const triggerBark = (text: string) => {
    setBarkText(text);
    setShowBark(true);
    if (barkTimeoutRef.current) clearTimeout(barkTimeoutRef.current);
    barkTimeoutRef.current = setTimeout(() => setShowBark(false), 2200);
  };

  // Spawn particle (heart or zzz)
  const spawnParticle = (type: "heart" | "zzz", xOffset: number, yOffset: number) => {
    const id = particleIdRef.current++;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 1.5 + 1;
    
    const newParticle: Particle = {
      id,
      x: posRef.current.x + xOffset,
      y: posRef.current.y + yOffset,
      dx: Math.cos(angle) * speed,
      dy: -Math.abs(Math.sin(angle) * speed) - 1, // always float up
      dr: Math.random() * 40 - 20, // random rotation
      type,
    };
    
    setParticles((prev) => [...prev, newParticle]);
    
    // Automatically prune particle
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, 1200);
  };

  // Find the closest corner of the screen and run/move to it
  const seekNearestCorner = () => {
    const bounds = getBounds();
    const px = posRef.current.x;
    const py = posRef.current.y;

    const corners = [
      { x: 0, y: 0, name: "Top-Left" },
      { x: bounds.maxX, y: 0, name: "Top-Right" },
      { x: 0, y: bounds.maxY, name: "Bottom-Left" },
      { x: bounds.maxX, y: bounds.maxY, name: "Bottom-Right" },
    ];

    let closestCorner = corners[0];
    let minDistance = Infinity;

    corners.forEach((c) => {
      const dx = px - c.x;
      const dy = py - c.y;
      const dist = dx * dx + dy * dy;
      if (dist < minDistance) {
        minDistance = dist;
        closestCorner = c;
      }
    });

    targetXRef.current = closestCorner.x;
    targetYRef.current = closestCorner.y;
    restingYRef.current = closestCorner.y; // Anchor resting height to this corner Y

    stateRef.current = "run";
    setState("run");
    triggerBark(`${closestCorner.name}! 🐾`);

    for (let i = 0; i < 2; i++) {
      spawnParticle("heart", petWidth / 2, 10);
    }
  };

  // Initialize random behaviors (decision making)
  const makeDecision = () => {
    if (isDraggingRef.current || stateRef.current === "fall") return;

    // If running towards click, don't interrupt
    if (targetXRef.current !== null) return;

    const r = Math.random();
    const bounds = getBounds();

    if (r < 0.35) {
      // Walk left or right
      const dir = Math.random() > 0.5 ? "right" : "left";
      directionRef.current = dir;
      setDirection(dir);
      
      velRef.current.x = dir === "right" ? walkSpeed : -walkSpeed;
      stateRef.current = "walk";
      setState("walk");
    } else if (r < 0.55) {
      // Sit down
      velRef.current.x = 0;
      stateRef.current = "sit";
      setState("sit");
      if (Math.random() < 0.3) triggerBark("Yap! 🐾");
    } else if (r < 0.70) {
      // Sleep
      velRef.current.x = 0;
      stateRef.current = "sleep";
      setState("sleep");
    } else {
      // Stand Idle
      velRef.current.x = 0;
      stateRef.current = "idle";
      setState("idle");
      if (Math.random() < 0.2) {
        const idles = ["Wag wag!", "Woof?", "Auuu~"];
        triggerBark(idles[Math.floor(Math.random() * idles.length)]);
      }
    }
  };

  // Setup loop
  useEffect(() => {
    // Spawn in extreme bottom-right corner
    const bounds = getBounds();
    posRef.current = {
      x: bounds.maxX,
      y: bounds.maxY,
    };
    restingYRef.current = bounds.maxY;
    directionRef.current = "right"; // initially look right at corner
    setDirection("right");
    setPos({ ...posRef.current });

    // decision loop every 3.5 - 6 seconds
    const startDecisionTimer = () => {
      const time = Math.random() * 2500 + 3500;
      decisionTimerRef.current = window.setTimeout(() => {
        makeDecision();
        startDecisionTimer();
      }, time);
    };
    startDecisionTimer();

    // Mouse movement listener (global to look at mouse)
    const handleMouseMoveGlobal = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      lastMouseMoveTimeRef.current = Date.now();
    };
    window.addEventListener("mousemove", handleMouseMoveGlobal);

    // Handle screen resize to keep pet in bounds
    const handleResize = () => {
      const b = getBounds();
      if (restingYRef.current >= b.maxY - 15) {
        restingYRef.current = b.maxY;
      } else {
        restingYRef.current = Math.min(restingYRef.current, b.maxY);
      }
      posRef.current.x = Math.min(posRef.current.x, b.maxX);
      posRef.current.y = Math.min(posRef.current.y, b.maxY);
    };
    window.addEventListener("resize", handleResize);

    // Global click listener to make pet run to location
    const handleWindowClick = (e: MouseEvent) => {
      // Don't attract if clicking inside a form element, button, input, or nav
      const target = e.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("input") ||
        target.closest("a") ||
        target.closest("select") ||
        target.closest("textarea") ||
        target.closest("form") ||
        target.closest("nav") ||
        isDraggingRef.current
      ) {
        return;
      }

      const bounds = getBounds();
      // Set target x coordinate
      const clickX = e.clientX - petWidth / 2;
      targetXRef.current = Math.min(Math.max(0, clickX), bounds.maxX);

      // Run towards it
      stateRef.current = "run";
      setState("run");
      
      const toLeft = targetXRef.current < posRef.current.x;
      directionRef.current = toLeft ? "left" : "right";
      setDirection(toLeft ? "left" : "right");
      velRef.current.x = toLeft ? -runSpeed : runSpeed;

      // Happy bark
      triggerBark(Math.random() > 0.5 ? "Run! ⚡" : "Let's go!");
      spawnParticle("heart", petWidth / 2, 0);
    };
    window.addEventListener("click", handleWindowClick);

    // Physics Update Loop
    let animationFrameId: number;
    const updatePhysics = () => {
      const bounds = getBounds();

      // Sleep spawning Zzz particles occasionally
      if (stateRef.current === "sleep" && Math.random() < 0.015) {
        spawnParticle("zzz", directionRef.current === "left" ? 18 : 54, 15);
      }

      if (isDraggingRef.current) {
        // Dragging physics
        stateRef.current = "drag";
        if (state !== "drag") setState("drag");
      } else {
        // Normal Physics
        
        // Active corner travel overrides normal gravity/friction/attraction logic
        if (targetXRef.current !== null && targetYRef.current !== null) {
          const dx = targetXRef.current - posRef.current.x;
          const dy = targetYRef.current - posRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < 8) {
            posRef.current.x = targetXRef.current;
            posRef.current.y = targetYRef.current;
            targetXRef.current = null;
            targetYRef.current = null;
            velRef.current = { x: 0, y: 0 };
            stateRef.current = "idle";
            setState("idle");
            triggerBark("Settled! 🐶");
          } else {
            stateRef.current = "run";
            if (state !== "run") setState("run");
            
            // Navigate straight to corner
            velRef.current.x = (dx / dist) * runSpeed;
            velRef.current.y = (dy / dist) * runSpeed;
            
            const curDir: PetDirection = dx < 0 ? "left" : "right";
            if (directionRef.current !== curDir) {
              directionRef.current = curDir;
              setDirection(curDir);
            }
          }
          
          posRef.current.x += velRef.current.x;
          posRef.current.y += velRef.current.y;
          
        } else {
          // Standard roaming and gravity behavior
          // Apply Gravity if in the air relative to resting Y
          if (posRef.current.y < restingYRef.current) {
            velRef.current.y += gravity;
            if (stateRef.current !== "fall") {
              stateRef.current = "fall";
              setState("fall");
            }
          }

          // Apply Friction
          const currentFriction = posRef.current.y >= restingYRef.current ? groundFriction : airFriction;
          velRef.current.x *= currentFriction;

          // Apply Click attraction movement
          if (targetXRef.current !== null && posRef.current.y >= restingYRef.current) {
            const distance = targetXRef.current - posRef.current.x;
            const curDir: PetDirection = distance < 0 ? "left" : "right";
            if (directionRef.current !== curDir) {
              directionRef.current = curDir;
              setDirection(curDir);
            }

            if (Math.abs(distance) < 8) {
              targetXRef.current = null;
              velRef.current.x = 0;
              stateRef.current = "idle";
              setState("idle");
              triggerBark("Phew! 💖");
            } else {
              stateRef.current = "run";
              if (state !== "run") setState("run");
              velRef.current.x = directionRef.current === "right" ? runSpeed : -runSpeed;
            }
          }

          posRef.current.x += velRef.current.x;
          posRef.current.y += velRef.current.y;

          // Ground collision (relative to resting Y)
          if (posRef.current.y >= restingYRef.current) {
            posRef.current.y = restingYRef.current;
            if (Math.abs(velRef.current.y) > 2) {
              velRef.current.y = -velRef.current.y * bounce;
            } else {
              velRef.current.y = 0;
              if (stateRef.current === "fall") {
                stateRef.current = "idle";
                setState("idle");
                triggerBark("Plop! 🐶");
                
                // If thrown and landed, seek nearest corner
                if (seekCornerAfterLandingRef.current) {
                  seekCornerAfterLandingRef.current = false;
                  setTimeout(() => {
                    if (stateRef.current === "idle" || stateRef.current === "walk") {
                      seekNearestCorner();
                    }
                  }, 300);
                }
              }
            }
          }
        }

        // Wall collisions
        if (posRef.current.x <= 0) {
          posRef.current.x = 0;
          velRef.current.x = -velRef.current.x * bounce;
          directionRef.current = "right";
          setDirection("right");
          targetXRef.current = null;
          targetYRef.current = null;
        } else if (posRef.current.x >= bounds.maxX) {
          posRef.current.x = bounds.maxX;
          velRef.current.x = -velRef.current.x * bounce;
          directionRef.current = "left";
          setDirection("left");
          targetXRef.current = null;
          targetYRef.current = null;
        }
      }

      // If idle/resting, face the nearest corner of the screen
      if (!isDraggingRef.current && targetXRef.current === null && targetYRef.current === null) {
        if (stateRef.current === "idle" || stateRef.current === "sit" || stateRef.current === "sleep") {
          const px = posRef.current.x;
          const nearestCornerX = px < bounds.maxX / 2 ? 0 : bounds.maxX;
          const curDir: PetDirection = nearestCornerX === 0 ? "left" : "right";
          if (directionRef.current !== curDir) {
            directionRef.current = curDir;
            setDirection(curDir);
          }
        }
      }

      // Sync React state
      setPos({ x: posRef.current.x, y: posRef.current.y });

      // Update active particles positions (basic float animation)
      setParticles((prev) =>
        prev.map((p) => ({
          ...p,
          x: p.x + p.dx,
          y: p.y + p.dy,
          dy: p.dy - 0.05, // accelerate upwards
        }))
      );

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    animationFrameId = requestAnimationFrame(updatePhysics);

    // Cleanups
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMoveGlobal);
      window.removeEventListener("click", handleWindowClick);
      window.removeEventListener("resize", handleResize);
      if (decisionTimerRef.current) clearTimeout(decisionTimerRef.current);
      if (barkTimeoutRef.current) clearTimeout(barkTimeoutRef.current);
    };
  }, [state]);

  // Drag start
  const handleDragStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: clientX, y: clientY };
    
    // Offset relative to the dog's top-left corner
    dragOffsetRef.current = {
      x: clientX - posRef.current.x,
      y: clientY - posRef.current.y,
    };
    
    targetXRef.current = null; // cancel click target
    velRef.current = { x: 0, y: 0 };
    setState("drag");
    stateRef.current = "drag";
    triggerBark("Hey! 😲");
  };

  // Dragging
  const handleDragging = (clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return;
    
    const bounds = getBounds();
    const newX = clientX - dragOffsetRef.current.x;
    const newY = clientY - dragOffsetRef.current.y;
    
    // Calculate throw velocity based on drag speeds
    velRef.current = {
      x: (clientX - lastMouseRef.current.x) * 0.8,
      y: (clientY - lastMouseRef.current.y) * 0.8,
    };

    lastMouseRef.current = { x: clientX, y: clientY };

    // Clamped coordinates during drag
    posRef.current = {
      x: Math.min(Math.max(0, newX), bounds.maxX),
      y: Math.min(Math.max(0, newY), bounds.maxY),
    };
    setPos({ ...posRef.current });
  };

  // Drag end
  const handleDragEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    
    const bounds = getBounds();
    const throwSpeed = Math.sqrt(velRef.current.x * velRef.current.x + velRef.current.y * velRef.current.y);
    
    if (throwSpeed > 2.5) {
      // It is a throw! Let it bounce and fly. When it lands, seek the closest corner.
      restingYRef.current = bounds.maxY;
      seekCornerAfterLandingRef.current = true;
      stateRef.current = "fall";
      setState("fall");
      triggerBark("Wheee! 💨");
    } else {
      // Gentle placement! Walk directly to closest corner
      seekNearestCorner();
    }
  };

  // Mouse drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    e.stopPropagation();
    handleDragStart(e.clientX, e.clientY);

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleDragging(moveEvent.clientX, moveEvent.clientY);
    };

    const onMouseUp = () => {
      handleDragEnd();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Touch drag handlers (Mobile/Tablet Support)
  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);

    const onTouchMove = (moveEvent: TouchEvent) => {
      const moveTouch = moveEvent.touches[0];
      handleDragging(moveTouch.clientX, moveTouch.clientY);
    };

    const onTouchEnd = () => {
      handleDragEnd();
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
  };

  // Click on pet directly triggers hearts and happy barks
  const handlePetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDraggingRef.current) return;

    velRef.current = {
      x: (Math.random() - 0.5) * 6,
      y: -Math.random() * 5 - 4, // jump up
    };
    stateRef.current = "fall";
    setState("fall");

    const soundEffects = ["Bark! 🐶", "Woof woof! 🐾", "Love you! ❤️", "Awoo! 🌟", "Boing! ✨"];
    triggerBark(soundEffects[Math.floor(Math.random() * soundEffects.length)]);

    // Spawn multiple hearts
    for (let i = 0; i < 4; i++) {
      setTimeout(() => spawnParticle("heart", petWidth / 2, 10), i * 120);
    }
  };

  // Compute eye tracking pupil offset
  const getPupilOffset = () => {
    if (state === "sleep") return { left: { dx: 0, dy: 0 }, right: { dx: 0, dy: 0 } };
    if (state === "drag" || state === "fall") {
      return { left: { dx: 0, dy: 0 }, right: { dx: 0, dy: 0 } };
    }

    // Puppy visual midpoint
    const petCenterX = pos.x + petWidth / 2;
    const petCenterY = pos.y + petHeight / 2;

    // Check if mouse is active (moved within last 3 seconds)
    const isMouseActive = Date.now() - lastMouseMoveTimeRef.current < 3000;
    
    let targetX = mousePos.x;
    let targetY = mousePos.y;

    if (!isMouseActive) {
      // Look towards nearest corner of the screen
      const bounds = getBounds();
      const nearestCornerX = pos.x < bounds.maxX / 2 ? 0 : bounds.maxX;
      const nearestCornerY = pos.y < bounds.maxY / 2 ? 0 : bounds.maxY;
      targetX = nearestCornerX + (nearestCornerX === 0 ? petWidth / 3 : -petWidth / 3);
      targetY = nearestCornerY + (nearestCornerY === 0 ? petHeight / 3 : -petHeight / 3);
    }

    const dx = targetX - petCenterX;
    const dy = targetY - petCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return { left: { dx: 0, dy: 0 }, right: { dx: 0, dy: 0 } };

    // Max pupil movement radius
    const maxOffset = 2.2;
    const scale = Math.min(maxOffset, distance * 0.05);

    // Apply facing flip correction to horizontal offsets
    const flip = direction === "left" ? -1 : 1;
    const pupilX = (dx / distance) * scale * flip;
    const pupilY = (dy / distance) * scale;

    return {
      left: { dx: pupilX, dy: pupilY },
      right: { dx: pupilX, dy: pupilY },
    };
  };

  const pupils = getPupilOffset();

  // Determine animations based on current states
  const tailClass = state === "run" ? "pet-wag-fast-anim" : (state === "walk" || state === "idle" ? "pet-wag-normal" : "");
  const earClass = state !== "sleep" ? "pet-ear-flap-anim" : "";
  const bodyBobClass = state === "sleep" ? "pet-bob-sleep" : (state === "idle" || state === "sit" ? "pet-bob-idle" : "");

  let frontLeftLegClass = "";
  let frontRightLegClass = "";
  let backLeftLegClass = "";
  let backRightLegClass = "";

  if (state === "walk") {
    frontLeftLegClass = "pet-leg-left";
    backLeftLegClass = "pet-leg-left";
    frontRightLegClass = "pet-leg-right";
    backRightLegClass = "pet-leg-right";
  } else if (state === "run") {
    frontLeftLegClass = "pet-leg-left-run";
    backLeftLegClass = "pet-leg-left-run";
    frontRightLegClass = "pet-leg-right-run";
    backRightLegClass = "pet-leg-right-run";
  }

  return (
    <div
      style={{
        position: "fixed",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${petWidth}px`,
        height: `${petHeight}px`,
        zIndex: 9999,
        cursor: state === "drag" ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onClick={handlePetClick}
      className="select-none active:cursor-grabbing transition-transform duration-75"
    >
      {/* Barking Speech Bubble */}
      {showBark && (
        <div
          className="absolute bg-white text-on-secondary-fixed border border-outline-variant font-headline-md font-bold px-3 py-1.5 rounded-2xl shadow-lg text-[11px] whitespace-nowrap text-center select-none pointer-events-none"
          style={{
            bottom: "78px",
            left: "50%",
            transform: "translateX(-50%)",
            animation: "pet-bark 2.2s forwards",
            transformOrigin: "bottom center",
          }}
        >
          {barkText}
          {/* Bubble tail arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-white"></div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-x-4 border-x-transparent border-t-4 border-t-outline-variant -z-10 translate-y-[1px]"></div>
        </div>
      )}

      {/* Floating Particles (Hearts / Zzz) */}
      {particles.map((p) => {
        if (p.type === "heart") {
          return (
            <div
              key={p.id}
              className="absolute text-rose-500 text-lg pointer-events-none"
              style={{
                left: `${p.x - pos.x}px`,
                top: `${p.y - pos.y}px`,
                transform: `rotate(${p.dr}deg)`,
                animation: "pet-heart 1.2s forwards",
                animationTimingFunction: "ease-out",
                zIndex: 10000,
                // Pass custom animation values
                // @ts-ignore
                "--dx": `${p.dx * 12}px`,
                "--dy": `${p.dy * 15}px`,
                "--dr": `${p.dr}deg`,
              }}
            >
              ❤️
            </div>
          );
        } else {
          return (
            <div
              key={p.id}
              className="absolute text-sky-400 font-headline-md font-extrabold text-xs pointer-events-none"
              style={{
                left: `${p.x - pos.x}px`,
                top: `${p.y - pos.y}px`,
                animation: "pet-zzz 1.2s forwards",
                zIndex: 10000,
              }}
            >
              Zzz
            </div>
          );
        }
      })}

      {/* The Puppy SVG Graphics */}
      <svg
        width={petWidth}
        height={petHeight}
        viewBox="0 0 72 72"
        style={{
          transform: `scaleX(${direction === "left" ? -1 : 1})`,
          transformOrigin: "center center",
        }}
        className="w-full h-full drop-shadow-md select-none pointer-events-none"
      >
        <g className={bodyBobClass}>
          {/* TAIL */}
          {state !== "sleep" && (
            <g className={tailClass} style={{ transformOrigin: "48px 45px" }}>
              {/* Shiba Inu Curly Tail */}
              <path
                d="M 48,45 C 55,42 61,35 58,26 C 56,21 49,23 50,28"
                fill="none"
                stroke="#E79E4A"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <path
                d="M 48,45 C 55,42 61,35 58,26 C 56,21 49,23 50,28"
                fill="none"
                stroke="#FFF4E0"
                strokeWidth="3.5"
                strokeLinecap="round"
                className="opacity-70"
              />
              {/* White tail tip fluff */}
              <circle cx="50" cy="27" r="4.5" fill="#FFF4E0" />
            </g>
          )}

          {/* BACK LEGS (rendered behind body) */}
          {state !== "sleep" && state !== "sit" && (
            <>
              {/* Back Left Leg */}
              <g className={backLeftLegClass}>
                <rect x="42" y="46" width="7" height="15" rx="3.5" fill="#C57E2F" />
                <rect x="42" y="57" width="7" height="4" rx="2" fill="#FFF4E0" />
              </g>
              {/* Back Right Leg */}
              <g className={backRightLegClass}>
                <rect x="18" y="46" width="7" height="15" rx="3.5" fill="#C57E2F" />
                <rect x="18" y="57" width="7" height="4" rx="2" fill="#FFF4E0" />
              </g>
            </>
          )}

          {/* BODY */}
          {state === "sleep" ? (
            // Curled up sleeping body
            <g>
              <ellipse cx="36" cy="46" rx="20" ry="16" fill="#E79E4A" />
              {/* White chest circle patch visible when sleeping */}
              <ellipse cx="28" cy="48" rx="10" ry="9" fill="#FFF4E0" />
              {/* Sleeping tucked paw */}
              <rect x="34" y="51" width="7" height="11" rx="3.5" transform="rotate(45 34 51)" fill="#FFF4E0" />
            </g>
          ) : state === "sit" ? (
            // Sitting body
            <g>
              <ellipse cx="34" cy="47" rx="18" ry="15" fill="#E79E4A" />
              <path d="M 20,40 C 20,48 26,58 35,58 C 44,58 50,48 50,40 Z" fill="#E79E4A" />
              <path d="M 24,42 Q 34,44 44,42 C 40,54 28,54 24,42" fill="#FFF4E0" />
              
              {/* Front legs resting on ground while sitting */}
              <rect x="25" y="48" width="6" height="14" rx="3" fill="#FFF4E0" />
              <rect x="37" y="48" width="6" height="14" rx="3" fill="#FFF4E0" />
              {/* Tucked back leg circles */}
              <circle cx="18" cy="53" r="6.5" fill="#C57E2F" />
              <rect x="15" y="53" width="9" height="7" rx="3.5" fill="#FFF4E0" />
            </g>
          ) : (
            // Standing/Walking body
            <g>
              <ellipse cx="33" cy="43" rx="19" ry="13.5" fill="#E79E4A" />
              {/* White chest wrap patch */}
              <path d="M 14,40 C 14,35 22,33 27,33 C 32,33 37,36 37,42 C 37,47 28,51 20,51 C 15,51 14,45 14,40 Z" fill="#FFF4E0" />
            </g>
          )}

          {/* FRONT LEGS (rendered in front of body) */}
          {state !== "sleep" && state !== "sit" && (
            <>
              {/* Front Left Leg */}
              <g className={frontLeftLegClass}>
                <rect x="34" y="46" width="7" height="16" rx="3.5" fill="#E79E4A" />
                <rect x="34" y="58" width="7" height="4" rx="2" fill="#FFF4E0" />
              </g>
              {/* Front Right Leg */}
              <g className={frontRightLegClass}>
                <rect x="26" y="46" width="7" height="16" rx="3.5" fill="#E79E4A" />
                <rect x="26" y="58" width="7" height="4" rx="2" fill="#FFF4E0" />
              </g>
            </>
          )}

          {/* HEAD */}
          <g
            style={{
              transform: state === "sleep" ? "translate(0px, 15px)" : state === "sit" ? "translate(-2px, 2px)" : "translate(0px, 0px)",
              transformOrigin: "26px 27px",
            }}
          >
            {/* EARS */}
            <g className={earClass}>
              {state === "sleep" ? (
                // Floppy/droopy ears during sleep
                <>
                  <polygon points="12,25 6,32 15,31" fill="#C57E2F" />
                  <polygon points="13,26 8,31 14,30" fill="#E28F8F" />
                  
                  <polygon points="34,23 37,30 29,29" fill="#C57E2F" />
                  <polygon points="33,24 35,29 30,28" fill="#E28F8F" />
                </>
              ) : (
                // Pointy cute alert Shiba ears
                <>
                  {/* Left Ear */}
                  <polygon points="12,24 6,11 18,17" fill="#E79E4A" />
                  <polygon points="10,21 8,14 15,18" fill="#F4BCA3" />
                  {/* Right Ear */}
                  <polygon points="35,21 40,7 28,15" fill="#E79E4A" />
                  <polygon points="33,18 36,10 28,15" fill="#F4BCA3" />
                </>
              )}
            </g>

            {/* HEAD MAIN */}
            <circle cx="24" cy="27" r="14" fill="#E79E4A" />

            {/* Cheek white spots (Shiba markings) */}
            <path
              d="M 11,29 C 11,35 18,39 24,39 C 30,39 37,35 37,29 C 37,23 30,26 24,26 C 18,26 11,23 11,29 Z"
              fill="#FFF4E0"
            />

            {/* SNOUT / MUZZLE */}
            <ellipse cx="24" cy="31" rx="5" ry="4" fill="#FFF" />
            {/* Nose */}
            <path d="M 22,30 Q 24,29 26,30 Q 25,32 24,32 Q 23,32 22,30 Z" fill="#1A1A1A" />
            {/* Mouth */}
            {state === "sleep" ? (
              <path d="M 22,33 Q 24,32 26,33" stroke="#9E9E9E" strokeWidth="1" fill="none" strokeLinecap="round" />
            ) : (
              <path d="M 21.5,33 C 22.5,34.5 24,34.5 24,33 C 24,34.5 25.5,34.5 26.5,33" stroke="#3A3A3A" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            )}

            {/* EYES */}
            {state === "sleep" ? (
              // Sleeping closed eyes
              <>
                {/* Left Eye */}
                <path d="M 14,27 Q 17,30 20,27" stroke="#1A1A1A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                {/* Right Eye */}
                <path d="M 28,27 Q 31,30 34,27" stroke="#1A1A1A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
              </>
            ) : state === "drag" || state === "fall" ? (
              // Dizzy/Surprised eyes during throw/drag
              <>
                {/* Left Dizzy Eye (X) */}
                <g transform="translate(14, 23)">
                  <line x1="0" y1="0" x2="4" y2="4" stroke="#1A1A1A" strokeWidth="2.2" strokeLinecap="round" />
                  <line x1="4" y1="0" x2="0" y2="4" stroke="#1A1A1A" strokeWidth="2.2" strokeLinecap="round" />
                </g>
                {/* Right Dizzy Eye (X) */}
                <g transform="translate(29, 23)">
                  <line x1="0" y1="0" x2="4" y2="4" stroke="#1A1A1A" strokeWidth="2.2" strokeLinecap="round" />
                  <line x1="4" y1="0" x2="0" y2="4" stroke="#1A1A1A" strokeWidth="2.2" strokeLinecap="round" />
                </g>
              </>
            ) : (
              // Normal eyes with cursor tracking
              <>
                {/* Left Eye Socket */}
                <ellipse cx="16" cy="25" rx="2.5" ry="3.5" fill="#1A1A1A" />
                {/* Right Eye Socket */}
                <ellipse cx="31" cy="25" rx="2.5" ry="3.5" fill="#1A1A1A" />

                {/* Left Pupil Highlight */}
                <circle cx={16 + pupils.left.dx} cy={24.2 + pupils.left.dy} r="0.9" fill="#FFF" />
                {/* Right Pupil Highlight */}
                <circle cx={31 + pupils.right.dx} cy={24.2 + pupils.right.dy} r="0.9" fill="#FFF" />
              </>
            )}

            {/* Blush Spots (adds premium cute details!) */}
            {state !== "sleep" && (
              <>
                <circle cx="11.5" cy="29" r="1.8" fill="#FFA5A5" className="opacity-70" />
                <circle cx="35.5" cy="29" r="1.8" fill="#FFA5A5" className="opacity-70" />
              </>
            )}
          </g>
        </g>
      </svg>
    </div>
  );
}
