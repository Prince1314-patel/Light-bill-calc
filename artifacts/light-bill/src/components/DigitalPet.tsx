import React, { useState, useEffect, useRef } from "react";
import * as THREE from "three";

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
  // Dimension config (larger, premium size)
  const petWidth = 108;
  const petHeight = 108;

  // Physics States
  const [pos, setPos] = useState({ x: 100, y: 300 });
  const [state, setState] = useState<PetState>("idle");
  const [direction, setDirection] = useState<PetDirection>("right");

  // Interactive states
  const [showBark, setShowBark] = useState(false);
  const [barkText, setBarkText] = useState("Woof!");
  const [particles, setParticles] = useState<Particle[]>([]);

  // Refs for tracking values inside physics animation loop
  const posRef = useRef({ x: 100, y: 300 });
  const velRef = useRef({ x: 0, y: 0 });
  const stateRef = useRef<PetState>("idle");
  const directionRef = useRef<PetDirection>("right");
  const targetXRef = useRef<number | null>(null);
  const targetYRef = useRef<number | null>(null);
  const seekCornerAfterLandingRef = useRef(false);
  const lastMouseMoveTimeRef = useRef(Date.now());
  const justDraggedRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  
  // Dragging state tracking refs (avoids react state delays in loop)
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Active vertical floor plane
  const restingYRef = useRef<number>(600);

  // User manual rotation ref
  const userRotationYRef = useRef<number>(0);

  // Random behavior timers
  const decisionTimerRef = useRef<number | null>(null);
  const barkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const particleIdRef = useRef(0);

  // Three.js Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    if (r < 0.4) {
      // Sit down
      velRef.current.x = 0;
      stateRef.current = "sit";
      setState("sit");
      if (Math.random() < 0.25) triggerBark("Yap! 🐾");
    } else if (r < 0.75) {
      // Sleep
      velRef.current.x = 0;
      stateRef.current = "sleep";
      setState("sleep");
    } else {
      // Stand Idle
      velRef.current.x = 0;
      stateRef.current = "idle";
      setState("idle");
      if (Math.random() < 0.15) {
        const idles = ["Wag wag!", "Woof?", "Auuu~"];
        triggerBark(idles[Math.floor(Math.random() * idles.length)]);
      }
    }
  };

  // Setup loop
  useEffect(() => {
    // Spawn in extreme bottom-right corner or load from localStorage
    const bounds = getBounds();
    
    let initialX = bounds.maxX;
    let initialY = bounds.maxY;
    
    try {
      const saved = localStorage.getItem("digital_pet_pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          initialX = Math.min(Math.max(0, parsed.x), bounds.maxX);
          initialY = Math.min(Math.max(0, parsed.y), bounds.maxY);
        }
      }
    } catch (e) {
      console.warn("Could not load pet position:", e);
    }

    posRef.current = {
      x: initialX,
      y: initialY,
    };
    restingYRef.current = initialY;
    directionRef.current = "right"; // initially look right
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
      mousePosRef.current = { x: e.clientX, y: e.clientY };
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
      
      try {
        localStorage.setItem("digital_pet_pos", JSON.stringify({
          x: posRef.current.x,
          y: posRef.current.y
        }));
      } catch (e) {
        console.warn("Could not save pet position:", e);
      }
    };
    window.addEventListener("resize", handleResize);

    // Physics Update Loop
    let animationFrameId: number;
    const updatePhysics = () => {
      const bounds = getBounds();

      // Sleep spawning Zzz particles occasionally
      if (stateRef.current === "sleep" && Math.random() < 0.015) {
        spawnParticle("zzz", directionRef.current === "left" ? 18 : 54, 15);
      }

      if (isDraggingRef.current) {
        stateRef.current = "drag";
        if (state !== "drag") setState("drag");
      } else {
        // Normal Physics
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
          // Standard gravity behavior
          if (posRef.current.y < restingYRef.current) {
            velRef.current.y += gravity;
            if (stateRef.current !== "fall") {
              stateRef.current = "fall";
              setState("fall");
            }
          }

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

          // Ground collision
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
                
                try {
                  localStorage.setItem("digital_pet_pos", JSON.stringify({
                    x: posRef.current.x,
                    y: posRef.current.y
                  }));
                } catch (e) {
                  console.warn("Could not save pet position:", e);
                }
                
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

      setPos({ x: posRef.current.x, y: posRef.current.y });

      setParticles((prev) =>
        prev.map((p) => ({
          ...p,
          x: p.x + p.dx,
          y: p.y + p.dy,
          dy: p.dy - 0.05,
        }))
      );

      animationFrameId = requestAnimationFrame(updatePhysics);
    };

    animationFrameId = requestAnimationFrame(updatePhysics);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMoveGlobal);
      window.removeEventListener("resize", handleResize);
      if (decisionTimerRef.current) clearTimeout(decisionTimerRef.current);
      if (barkTimeoutRef.current) clearTimeout(barkTimeoutRef.current);
    };
  }, []);

  // Setup Three.js WebGL Rendering (Organic Dog Model)
  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. Scene setup
    const scene = new THREE.Scene();
    
    // Perspective camera
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.3, 4.8);
    camera.lookAt(0, 0.12, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(petWidth, petHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(3, 5, 2);
    scene.add(dirLight);

    // 3. Materials (Warm organic color palette)
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xE5A65D, roughness: 0.62 }); // Golden fur
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xFFF5E5, roughness: 0.62 });  // Soft cream chest/muzzle
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1F1F1F, roughness: 0.8 });   // Eyes/Nose
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xFF8B8B, roughness: 0.7 });    // Cute tongue
    const innerEarMat = new THREE.MeshStandardMaterial({ color: 0xF7D1BA, roughness: 0.75 }); // Inner ear pink

    // 4. Construct organic Corgi/Golden Retriever puppy meshes
    const dogGroup = new THREE.Group();
    scene.add(dogGroup);

    // Rounded organic body capsule (rotate by 90deg to be horizontal)
    const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.55, 8, 16);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, orangeMat);
    bodyMesh.position.y = 0.22;
    dogGroup.add(bodyMesh);

    // Cream white chest patch (squashed sphere)
    const chestGeo = new THREE.SphereGeometry(0.3, 16, 16);
    chestGeo.scale(1.0, 1.25, 0.8);
    const chestMesh = new THREE.Mesh(chestGeo, whiteMat);
    chestMesh.position.set(0, -0.05, -0.42);
    bodyMesh.add(chestMesh);

    // Head pivot group
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.62, -0.48);
    dogGroup.add(headGroup);

    // Rounded organic head sphere
    const headGeo = new THREE.SphereGeometry(0.38, 20, 20);
    const headMesh = new THREE.Mesh(headGeo, orangeMat);
    headGroup.add(headMesh);

    // Shiba cheek markings (white patch on cheeks)
    const cheekGeo = new THREE.SphereGeometry(0.32, 16, 16);
    cheekGeo.scale(1.08, 0.9, 0.95);
    const cheekL = new THREE.Mesh(cheekGeo, whiteMat);
    cheekL.position.set(0, -0.08, 0.08);
    headMesh.add(cheekL);

    // Rounded muzzle snout
    const snoutGeo = new THREE.SphereGeometry(0.18, 16, 16);
    snoutGeo.scale(1.0, 0.78, 1.3);
    const snoutMesh = new THREE.Mesh(snoutGeo, whiteMat);
    snoutMesh.position.set(0, -0.06, -0.32);
    headGroup.add(snoutMesh);

    // Smooth nose
    const noseGeo = new THREE.SphereGeometry(0.045, 8, 8);
    noseGeo.scale(1.2, 0.8, 0.8);
    const noseMesh = new THREE.Mesh(noseGeo, darkMat);
    noseMesh.position.set(0, 0.07, -0.16);
    snoutMesh.add(noseMesh);

    // Cute pink tongue sticking out!
    const tongueGeo = new THREE.SphereGeometry(0.06, 8, 8);
    tongueGeo.scale(1.1, 0.4, 1.5);
    const tongueMesh = new THREE.Mesh(tongueGeo, pinkMat);
    tongueMesh.position.set(0, -0.12, -0.16);
    snoutMesh.add(tongueMesh);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const eyeL = new THREE.Mesh(eyeGeo, darkMat);
    eyeL.position.set(-0.16, 0.08, -0.28);
    headGroup.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, darkMat);
    eyeR.position.set(0.16, 0.08, -0.28);
    headGroup.add(eyeR);

    // Sparkly eye highlight pupils (little white spheres)
    const pupilGeo = new THREE.SphereGeometry(0.018, 8, 8);
    const pupilL = new THREE.Mesh(pupilGeo, whiteMat);
    pupilL.position.set(0.015, 0.015, -0.035);
    eyeL.add(pupilL);

    const pupilR = new THREE.Mesh(pupilGeo, whiteMat);
    pupilR.position.set(0.015, 0.015, -0.035);
    eyeR.add(pupilR);

    // Floppy organic puppy ears (using capsules)
    // We offset pivot to the top so they flop naturally on the head
    const earGeo = new THREE.CapsuleGeometry(0.1, 0.28, 6, 12);
    earGeo.translate(0, -0.15, 0); // pivot at base

    const earL = new THREE.Mesh(earGeo, orangeMat);
    earL.position.set(-0.3, 0.1, 0);
    earL.rotation.z = 0.15;
    earL.rotation.x = 0.05;
    headGroup.add(earL);

    const earInnerL = new THREE.Mesh(earGeo, innerEarMat);
    earInnerL.scale.set(0.72, 0.8, 0.72);
    earInnerL.position.set(0, 0, -0.015);
    earL.add(earInnerL);

    const earR = new THREE.Mesh(earGeo, orangeMat);
    earR.position.set(0.3, 0.1, 0);
    earR.rotation.z = -0.15;
    earR.rotation.x = 0.05;
    headGroup.add(earR);

    const earInnerR = new THREE.Mesh(earGeo, innerEarMat);
    earInnerR.scale.set(0.72, 0.8, 0.72);
    earInnerR.position.set(0, 0, -0.015);
    earR.add(earInnerR);

    // Tail (Capsule tail with white sphere tip)
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.35, 0.52);
    dogGroup.add(tailGroup);

    const tailGeo = new THREE.CapsuleGeometry(0.045, 0.32, 6, 10);
    tailGeo.translate(0, 0.16, 0);
    const tailMesh = new THREE.Mesh(tailGeo, orangeMat);
    tailMesh.rotation.x = Math.PI / 4.2;
    tailGroup.add(tailMesh);

    const tailTipGeo = new THREE.SphereGeometry(0.065, 8, 8);
    const tailTip = new THREE.Mesh(tailTipGeo, whiteMat);
    tailTip.position.y = 0.28;
    tailMesh.add(tailTip);

    // Legs & Paws (Capsules + Squashed Spheres for organic look)
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.32, 6, 12);
    const footGeo = new THREE.SphereGeometry(0.1, 10, 10);
    footGeo.scale(1.0, 0.75, 1.25); // squashed white paw

    const legFL = new THREE.Mesh(legGeo, orangeMat);
    legFL.position.set(-0.24, -0.22, -0.28);
    dogGroup.add(legFL);
    const footFL = new THREE.Mesh(footGeo, whiteMat);
    footFL.position.set(0, -0.16, -0.02);
    legFL.add(footFL);

    const legFR = new THREE.Mesh(legGeo, orangeMat);
    legFR.position.set(0.24, -0.22, -0.28);
    dogGroup.add(legFR);
    const footFR = new THREE.Mesh(footGeo, whiteMat);
    footFR.position.set(0, -0.16, -0.02);
    legFR.add(footFR);

    const legBL = new THREE.Mesh(legGeo, orangeMat);
    legBL.position.set(-0.24, -0.22, 0.28);
    dogGroup.add(legBL);
    const footBL = new THREE.Mesh(footGeo, whiteMat);
    footBL.position.set(0, -0.16, -0.02);
    legBL.add(footBL);

    const legBR = new THREE.Mesh(legGeo, orangeMat);
    legBR.position.set(0.24, -0.22, 0.28);
    dogGroup.add(legBR);
    const footBR = new THREE.Mesh(footGeo, whiteMat);
    footBR.position.set(0, -0.16, -0.02);
    legBR.add(footBR);

    // Center puppy position in scene frame
    dogGroup.position.set(0, -0.05, 0);

    // Animation frames
    let frameId: number;
    const clock = new THREE.Clock();

    const renderAnim = () => {
      frameId = requestAnimationFrame(renderAnim);
      
      const time = clock.getElapsedTime();
      const current = stateRef.current;

      // 1. Orient horizontal direction (Yaw rotation) + USER manual rotation
      let targetRotY = directionRef.current === "right" ? Math.PI / 2 : -Math.PI / 2;
      if (current === "sleep") {
        targetRotY = directionRef.current === "right" ? Math.PI / 1.5 : -Math.PI / 1.5;
      }
      
      // Combine target direction rotation and manual drag/wheel rotation smoothly
      const finalTargetRotY = targetRotY + userRotationYRef.current;
      dogGroup.rotation.y += (finalTargetRotY - dogGroup.rotation.y) * 0.16;

      // Reset transforms
      legFL.rotation.x = 0;
      legFR.rotation.x = 0;
      legBL.rotation.x = 0;
      legBR.rotation.x = 0;
      legFL.position.y = -0.22;
      legFR.position.y = -0.22;
      legBL.position.y = -0.22;
      legBR.position.y = -0.22;

      bodyMesh.rotation.set(0, 0, 0);
      bodyMesh.position.y = 0.22;
      headGroup.rotation.set(0, 0, 0);
      headGroup.position.set(0, 0.62, -0.48);

      earL.rotation.set(0.05, 0, 0.15);
      earR.rotation.set(0.05, 0, -0.15);

      // Eye pupil/Head looking direction
      if (current !== "sleep" && current !== "drag") {
        const petCenterX = posRef.current.x + petWidth / 2;
        const petCenterY = posRef.current.y + petHeight / 2;
        
        const isMouseActive = Date.now() - lastMouseMoveTimeRef.current < 3000;
        let tX = mousePosRef.current.x;
        let tY = mousePosRef.current.y;
        
        if (!isMouseActive) {
          const b = getBounds();
          const nearestCornerX = posRef.current.x < b.maxX / 2 ? 0 : b.maxX;
          const nearestCornerY = posRef.current.y < b.maxY / 2 ? 0 : b.maxY;
          tX = nearestCornerX + (nearestCornerX === 0 ? petWidth / 3 : -petWidth / 3);
          tY = nearestCornerY + (nearestCornerY === 0 ? petHeight / 3 : -petHeight / 3);
        }

        const dx = tX - petCenterX;
        const dy = tY - petCenterY;

        // Rotation flip correction (if rotated, align look correctly)
        const faceFlip = directionRef.current === "left" ? -1 : 1;
        const headTargetY = Math.min(Math.max(dx * 0.0015, -0.35), 0.35) * faceFlip;
        const headTargetX = Math.min(Math.max(dy * 0.0015, -0.25), 0.25);

        headGroup.rotation.y += (headTargetY - headGroup.rotation.y) * 0.12;
        headGroup.rotation.x += (headTargetX - headGroup.rotation.x) * 0.12;
      }

      // State specific animations
      if (current === "idle") {
        // breathing bob
        const bob = Math.sin(time * 3.0) * 0.015;
        bodyMesh.position.y += bob;
        headGroup.position.y = 0.62 + bob * 0.4;
        
        tailMesh.rotation.z = Math.sin(time * 4.5) * 0.15;
        tailMesh.rotation.y = Math.cos(time * 4.5) * 0.08;

        // ear flopping breathing bob
        earL.rotation.z += Math.sin(time * 1.8) * 0.02;
        earR.rotation.z -= Math.sin(time * 1.8) * 0.02;
      } 
      else if (current === "walk") {
        // Leg swing walking cycles
        const swing = Math.sin(time * 14.0) * 0.45;
        legFL.rotation.x = swing;
        legBR.rotation.x = swing;
        legFR.rotation.x = -swing;
        legBL.rotation.x = -swing;

        bodyMesh.position.y += Math.sin(time * 28.0) * 0.025;
        tailMesh.rotation.z = Math.sin(time * 14.0) * 0.35;
        
        // floppy ears swinging
        earL.rotation.z += Math.sin(time * 14.0) * 0.05;
        earR.rotation.z -= Math.sin(time * 14.0) * 0.05;
      } 
      else if (current === "run") {
        // Faster swing for running
        const swing = Math.sin(time * 26.0) * 0.68;
        legFL.rotation.x = swing;
        legBR.rotation.x = swing;
        legFR.rotation.x = -swing;
        legBL.rotation.x = -swing;

        bodyMesh.position.y += Math.sin(time * 52.0) * 0.05;
        bodyMesh.rotation.x = 0.08; // Lean forward
        
        tailMesh.rotation.z = Math.sin(time * 36.0) * 0.6;
        headGroup.rotation.x += Math.sin(time * 52.0) * 0.04;

        // floppy ears flapping faster
        earL.rotation.z += Math.sin(time * 26.0) * 0.12;
        earR.rotation.z -= Math.sin(time * 26.0) * 0.12;
      } 
      else if (current === "sit") {
        // Tucked sitting leg angles
        legFL.rotation.x = -Math.PI / 3.4;
        legFR.rotation.x = -Math.PI / 3.4;
        legBL.rotation.x = Math.PI / 2.3;
        legBR.rotation.x = Math.PI / 2.3;

        legFL.position.y = -0.15;
        legFR.position.y = -0.15;
        legBL.position.y = -0.05;
        legBR.position.y = -0.05;

        bodyMesh.position.y = 0.12;
        headGroup.position.y = 0.48;

        tailMesh.rotation.z = Math.sin(time * 2.8) * 0.08;
      } 
      else if (current === "sleep") {
        // Curled sleeping group angles
        bodyMesh.rotation.y = Math.sin(time * 1.4) * 0.03;
        bodyMesh.rotation.z = Math.PI / 2.15;
        bodyMesh.position.y = 0.1;

        headGroup.position.set(-0.18, 0.18, -0.32);
        headGroup.rotation.z = 0.45;
        headGroup.rotation.x = 0.12;

        // ears closed/sleeping droop
        earL.rotation.z = 0.38;
        earR.rotation.z = -0.38;

        legFL.rotation.x = -Math.PI / 2.2;
        legFR.rotation.x = -Math.PI / 2.2;
        legBL.rotation.x = Math.PI / 2.2;
        legBR.rotation.x = Math.PI / 2.2;
        legFL.position.y = 0.02;
        legFR.position.y = 0.02;
        legBL.position.y = 0.05;
        legBR.position.y = 0.05;

        tailMesh.rotation.z = 0.08;
      } 
      else if (current === "drag") {
        // Dangling limbs
        const dangling = Math.sin(time * 16.0);
        legFL.rotation.z = 0.35 + dangling * 0.12;
        legFR.rotation.z = -0.35 - dangling * 0.12;
        legBL.rotation.z = 0.25 + dangling * 0.12;
        legBR.rotation.z = -0.25 - dangling * 0.12;

        headGroup.rotation.z = Math.sin(time * 11.0) * 0.18;
        headGroup.rotation.x = 0.12;
        
        tailMesh.rotation.x = 0;
        tailMesh.rotation.z = 0;
        
        earL.rotation.z = 0.35 + dangling * 0.05;
        earR.rotation.z = -0.35 - dangling * 0.05;
      } 
      else if (current === "fall") {
        const dangling = Math.sin(time * 22.0);
        legFL.rotation.x = 0.25 + dangling * 0.18;
        legFR.rotation.x = 0.25 - dangling * 0.18;
        legBL.rotation.x = 0.18 + dangling * 0.12;
        legBR.rotation.x = 0.18 - dangling * 0.12;

        headGroup.rotation.x = -0.22;
        tailMesh.rotation.z = Math.sin(time * 28.0) * 0.18;
        
        earL.rotation.z = 0.32 + dangling * 0.08;
        earR.rotation.z = -0.32 - dangling * 0.08;
      }

      renderer.render(scene, camera);
    };

    renderAnim();

    const handleCanvasResize = () => {
      renderer.setSize(petWidth, petHeight);
    };
    window.addEventListener("resize", handleCanvasResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleCanvasResize);
      renderer.dispose();
      
      bodyGeo.dispose();
      chestGeo.dispose();
      headGeo.dispose();
      cheekGeo.dispose();
      snoutGeo.dispose();
      noseGeo.dispose();
      tongueGeo.dispose();
      eyeGeo.dispose();
      pupilGeo.dispose();
      earGeo.dispose();
      legGeo.dispose();
      footGeo.dispose();
      tailGeo.dispose();
      tailTipGeo.dispose();

      orangeMat.dispose();
      whiteMat.dispose();
      darkMat.dispose();
      pinkMat.dispose();
      innerEarMat.dispose();
    };
  }, []);

  // Drag start
  const handleDragStart = (clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: clientX, y: clientY };
    
    dragOffsetRef.current = {
      x: clientX - posRef.current.x,
      y: clientY - posRef.current.y,
    };
    
    targetXRef.current = null;
    targetYRef.current = null;
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
    
    velRef.current = {
      x: (clientX - lastMouseRef.current.x) * 0.8,
      y: (clientY - lastMouseRef.current.y) * 0.8,
    };

    lastMouseRef.current = { x: clientX, y: clientY };

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
    
    // Set flag to prevent trailing click event from attracting puppy
    justDraggedRef.current = true;
    setTimeout(() => {
      justDraggedRef.current = false;
    }, 100);

    // Keep the current placement coordinates exactly!
    restingYRef.current = posRef.current.y;
    targetXRef.current = null;
    targetYRef.current = null;
    velRef.current = { x: 0, y: 0 };
    stateRef.current = "idle";
    setState("idle");
    triggerBark("Stay! 📍");
    
    try {
      localStorage.setItem("digital_pet_pos", JSON.stringify({
        x: posRef.current.x,
        y: posRef.current.y
      }));
    } catch (e) {
      console.warn("Could not save pet position:", e);
    }
    
    for (let i = 0; i < 2; i++) {
      spawnParticle("heart", petWidth / 2, 10);
    }
  };

  // Mouse click and drag controls (with right-click / shift-drag rotation)
  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const isRotate = e.button === 2 || e.shiftKey; // Right-click or Shift-drag to rotate
    
    if (isRotate) {
      e.preventDefault();
      const startX = e.clientX;
      const startRotY = userRotationYRef.current;

      const onMouseMoveRotate = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        userRotationYRef.current = startRotY + deltaX * 0.012; // Update rotation yaw
      };

      const onMouseUpRotate = () => {
        window.removeEventListener("mousemove", onMouseMoveRotate);
        window.removeEventListener("mouseup", onMouseUpRotate);
      };

      window.addEventListener("mousemove", onMouseMoveRotate);
      window.addEventListener("mouseup", onMouseUpRotate);
    } else {
      if (e.button !== 0) return; // Left click only for move
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
    }
  };

  // Touch drag handlers
  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    
    // Support multi-touch zoom/rotation if needed. For simple touch, single finger drags, two fingers rotate.
    if (e.touches.length >= 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const startX = (touch1.clientX + touch2.clientX) / 2;
      const startRotY = userRotationYRef.current;

      const onTouchMoveRotate = (moveEvent: TouchEvent) => {
        if (moveEvent.touches.length < 2) return;
        const t1 = moveEvent.touches[0];
        const t2 = moveEvent.touches[1];
        const curX = (t1.clientX + t2.clientX) / 2;
        const deltaX = curX - startX;
        userRotationYRef.current = startRotY + deltaX * 0.015;
      };

      const onTouchEndRotate = () => {
        window.removeEventListener("touchmove", onTouchMoveRotate);
        window.removeEventListener("touchend", onTouchEndRotate);
      };

      window.addEventListener("touchmove", onTouchMoveRotate, { passive: true });
      window.addEventListener("touchend", onTouchEndRotate);
    } else {
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
    }
  };

  // Click on pet directly triggers hearts and barks
  const handlePetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDraggingRef.current || justDraggedRef.current) return;

    velRef.current = {
      x: (Math.random() - 0.5) * 6,
      y: -Math.random() * 5 - 4,
    };
    stateRef.current = "fall";
    setState("fall");

    const soundEffects = ["Bark! 🐶", "Woof woof! 🐾", "Love you! ❤️", "Awoo! 🌟", "Boing! ✨"];
    triggerBark(soundEffects[Math.floor(Math.random() * soundEffects.length)]);

    for (let i = 0; i < 4; i++) {
      setTimeout(() => spawnParticle("heart", petWidth / 2, 10), i * 120);
    }
  };

  // Block context menu so right click drag rotates without popping menu
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Mouse scroll wheel rotation over puppy
  const onWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    // Scroll down rotates right, scroll up rotates left
    userRotationYRef.current += e.deltaY * 0.003;
  };

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
      onContextMenu={onContextMenu}
      onWheel={onWheel}
      className="select-none active:cursor-grabbing transition-transform duration-75"
    >
      {/* Barking Speech Bubble */}
      {showBark && (
        <div
          className="absolute bg-white text-on-secondary-fixed border border-outline-variant font-headline-md font-bold px-3 py-1.5 rounded-2xl shadow-lg text-[11px] whitespace-nowrap text-center select-none pointer-events-none"
          style={{
            bottom: "114px", // Adjusted for larger size (108px)
            left: "50%",
            transform: "translateX(-50%)",
            animation: "pet-bark 2.2s forwards",
            transformOrigin: "bottom center",
          }}
        >
          {barkText}
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

      {/* Three.js 3D WebGL Canvas */}
      <canvas
        ref={canvasRef}
        width={petWidth}
        height={petHeight}
        className="w-full h-full drop-shadow-md select-none pointer-events-none"
      />
    </div>
  );
}
