// Neo-Synapse BioMap - Force-Directed Graph Visualizer (Note-Highlight Support)

export class BioGraph {
  constructor(canvasId, onNodeSelected) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.onNodeSelected = onNodeSelected;

    this.nodes = [];
    this.links = [];
    this.activeLayers = new Set(['L1', 'L2', 'L3', 'L4']);
    this.searchQuery = "";
    this.highlightNoteId = null; // Highlighting connections of a specific note

    // Camera transform state
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.minZoom = 0.25;
    this.maxZoom = 4;

    // Selection state
    this.selectedNodeId = null;
    this.draggedNode = null;

    // Multi-touch pinch state
    this.touchStartDist = null;
    this.touchStartZoom = null;

    // Physics parameters
    this.springLength = 160;
    this.springStrength = 0.04;
    this.repulsionStrength = 6000;
    this.gravity = 0.04;
    this.damping = 0.82;

    this.initEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Start simulation loop
    this.animate();
  }

  // Set nodes and links and initialize their physics positions
  setData(nodes, links) {
    const width = this.canvas.width;
    const height = this.canvas.height;

    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    
    this.nodes = nodes.map(node => {
      const existing = nodeMap.get(node.id);
      return {
        ...node,
        x: existing ? existing.x : width / 2 + (Math.random() - 0.5) * 300,
        y: existing ? existing.y : height / 2 + (Math.random() - 0.5) * 300,
        vx: existing ? existing.vx : 0,
        vy: existing ? existing.vy : 0,
        radius: node.layer === 'L4' ? 42 : 36
      };
    });

    this.links = links.map(link => ({ ...link }));
    this.resetCamera();
  }

  updateActiveLayers(layersSet) {
    this.activeLayers = layersSet;
  }

  setSearchQuery(query) {
    this.searchQuery = query.toLowerCase().trim();
  }

  setSelectedNode(nodeId) {
    this.selectedNodeId = nodeId;
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  resetCamera() {
    this.zoom = 1.0;
    this.panX = this.canvas.width / 2;
    this.panY = this.canvas.height / 2;
  }

  // --- Coordinate conversion ---
  toWorldCoords(screenX, screenY) {
    return {
      x: (screenX - this.panX) / this.zoom,
      y: (screenY - this.panY) / this.zoom
    };
  }

  toScreenCoords(worldX, worldY) {
    return {
      x: worldX * this.zoom + this.panX,
      y: worldY * this.zoom + this.panY
    };
  }

  getActiveNodes() {
    return this.nodes.filter(node => this.activeLayers.has(node.layer));
  }

  getActiveLinks() {
    const activeIds = new Set(this.getActiveNodes().map(n => n.id));
    return this.links.filter(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      return activeIds.has(sId) && activeIds.has(tId);
    });
  }

  // --- Physics Simulation Engine ---
  updatePhysics() {
    const activeNodes = this.getActiveNodes();
    const activeLinks = this.getActiveLinks();

    if (activeNodes.length === 0) return;

    // 1. Repulsion force between all nodes
    for (let i = 0; i < activeNodes.length; i++) {
      const nodeA = activeNodes[i];
      for (let j = i + 1; j < activeNodes.length; j++) {
        const nodeB = activeNodes[j];
        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const distSq = dx * dx + dy * dy + 0.1;
        const dist = Math.sqrt(distSq);

        if (dist < 400) {
          const force = this.repulsionStrength / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (nodeA !== this.draggedNode) {
            nodeA.vx -= fx;
            nodeA.vy -= fy;
          }
          if (nodeB !== this.draggedNode) {
            nodeB.vx += fx;
            nodeB.vy += fy;
          }
        }
      }
    }

    // 2. Spring attraction force along links
    const nodeMap = new Map(activeNodes.map(n => [n.id, n]));
    activeLinks.forEach(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      const source = nodeMap.get(sId);
      const target = nodeMap.get(tId);

      if (source && target) {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const force = (dist - this.springLength) * this.springStrength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (source !== this.draggedNode) {
          source.vx += fx;
          source.vy += fy;
        }
        if (target !== this.draggedNode) {
          target.vx -= fx;
          target.vy -= fy;
        }
      }
    });

    // 3. Centering gravity force
    activeNodes.forEach(node => {
      if (node === this.draggedNode) return;
      node.vx -= node.x * this.gravity;
      node.vy -= node.y * this.gravity;

      node.x += node.vx;
      node.y += node.vy;
      node.vx *= this.damping;
      node.vy *= this.damping;
    });

    if (this.draggedNode) {
      this.draggedNode.vx = 0;
      this.draggedNode.vy = 0;
    }
  }

  // --- Rendering Engine ---
  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    const activeNodes = this.getActiveNodes();
    const activeLinks = this.getActiveLinks();
    const nodeMap = new Map(activeNodes.map(n => [n.id, n]));

    // Draw link connections first
    activeLinks.forEach(link => {
      const sId = typeof link.source === 'object' ? link.source.id : link.source;
      const tId = typeof link.target === 'object' ? link.target.id : link.target;
      const source = nodeMap.get(sId);
      const target = nodeMap.get(tId);

      if (source && target) {
        this.drawLink(source, target, link);
      }
    });

    // Draw active nodes
    activeNodes.forEach(node => {
      this.drawNode(node);
    });

    this.ctx.restore();
  }

  drawLink(source, target, link) {
    const isSelected = source.id === this.selectedNodeId || target.id === this.selectedNodeId;
    const isNoteMatch = this.highlightNoteId && link.noteId === this.highlightNoteId;
    const isDimmed = this.highlightNoteId && !isNoteMatch;
    
    this.ctx.save();
    if (isDimmed) {
      this.ctx.globalAlpha = 0.15;
    }

    this.ctx.beginPath();
    this.ctx.moveTo(source.x, source.y);
    this.ctx.lineTo(target.x, target.y);

    if (isSelected || isNoteMatch) {
      this.ctx.strokeStyle = isNoteMatch ? 'var(--color-primary)' : 'hsl(28, 45%, 40%)';
      this.ctx.lineWidth = 3 / this.zoom;
    } else {
      this.ctx.strokeStyle = 'hsla(28, 15%, 50%, 0.4)';
      this.ctx.lineWidth = 1.5 / this.zoom;
    }
    this.ctx.stroke();

    // Draw simple arrow in mid-point
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const angle = Math.atan2(target.y - source.y, target.x - source.x);
    const arrowSize = 6 / this.zoom;

    this.ctx.save();
    this.ctx.translate(midX, midY);
    this.ctx.rotate(angle);
    this.ctx.beginPath();
    this.ctx.moveTo(-arrowSize, -arrowSize / 1.5);
    this.ctx.lineTo(0, 0);
    this.ctx.lineTo(-arrowSize, arrowSize / 1.5);
    this.ctx.strokeStyle = (isSelected || isNoteMatch) ? 'hsl(28, 45%, 35%)' : 'hsla(28, 15%, 50%, 0.6)';
    this.ctx.lineWidth = 2 / this.zoom;
    this.ctx.stroke();
    this.ctx.restore();

    // Draw relationship badge
    if ((isSelected || isNoteMatch) && this.zoom > 0.6) {
      this.ctx.save();
      this.ctx.font = `bold ${9 / this.zoom}px Inter`;
      const text = link.label || link.type;
      const textWidth = this.ctx.measureText(text).width;
      this.ctx.fillStyle = 'hsl(36, 33%, 94%)';
      this.ctx.fillRect(midX - textWidth / 2 - 4, midY - 6, textWidth + 8, 12);
      this.ctx.strokeStyle = 'hsl(36, 12%, 80%)';
      this.ctx.lineWidth = 1 / this.zoom;
      this.ctx.strokeRect(midX - textWidth / 2 - 4, midY - 6, textWidth + 8, 12);
      this.ctx.fillStyle = 'hsl(20, 10%, 15%)';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(text, midX, midY + 3);
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  drawNode(node) {
    const isSelected = node.id === this.selectedNodeId;
    const isSearchMatch = this.searchQuery && (
      node.label.toLowerCase().includes(this.searchQuery) ||
      (node.desc && node.desc.toLowerCase().includes(this.searchQuery)) ||
      (node.keywords && node.keywords.some(kw => kw.toLowerCase().includes(this.searchQuery)))
    );
    const isNoteMatch = this.highlightNoteId && node.noteId === this.highlightNoteId;

    // Dimming logic
    const isDimmedBySearch = this.searchQuery && !isSearchMatch;
    const isDimmedByNote = this.highlightNoteId && !isNoteMatch;
    const isDimmed = isDimmedBySearch || isDimmedByNote;

    let layerColor = 'hsl(20, 10%, 40%)';
    switch (node.layer) {
      case 'L1': layerColor = 'var(--color-l1)'; break;
      case 'L2': layerColor = 'var(--color-l2)'; break;
      case 'L3': layerColor = 'var(--color-l3)'; break;
      case 'L4': layerColor = 'var(--color-l4)'; break;
    }

    this.ctx.save();
    this.ctx.globalAlpha = isDimmed ? 0.15 : 1.0;

    // Draw Outer Outline for Selected / Highlighted
    if (isSelected || isNoteMatch) {
      this.ctx.strokeStyle = 'var(--color-primary)';
      this.ctx.lineWidth = 3 / this.zoom;
      
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Draw Node Core Circle (Warm parchment look)
    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    
    const grad = this.ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
    grad.addColorStop(0, 'hsl(36, 100%, 99%)');
    grad.addColorStop(1, 'hsl(36, 25%, 90%)');
    
    this.ctx.fillStyle = grad;
    this.ctx.fill();
    this.ctx.strokeStyle = layerColor;
    this.ctx.lineWidth = (isSearchMatch || isNoteMatch) ? 4 / this.zoom : 2 / this.zoom;
    this.ctx.stroke();

    // Node Type Icon
    this.ctx.fillStyle = layerColor;
    this.ctx.font = `bold ${10 / this.zoom}px Outfit`;
    this.ctx.textAlign = 'center';
    let labelSymbol = node.type.substring(0, 4).toUpperCase();
    this.ctx.fillText(labelSymbol, node.x, node.y - 12);

    // Node Name Label (Dark sepia text for visibility)
    this.ctx.fillStyle = 'hsl(20, 10%, 15%)';
    this.ctx.font = `${node.layer === 'L4' ? 'bold' : 'normal'} ${11 / this.zoom}px Inter`;
    this.ctx.textAlign = 'center';
    
    const words = node.label.split(' ');
    let line1 = "";
    let line2 = "";
    if (words.length > 2) {
      line1 = words.slice(0, 2).join(' ');
      line2 = words.slice(2).join(' ');
    } else if (words.length === 2) {
      line1 = words[0];
      line2 = words[1];
    } else {
      line1 = words[0];
    }

    if (line2) {
      this.ctx.fillText(line1, node.x, node.y + 4);
      this.ctx.fillText(line2, node.x, node.y + 16);
    } else {
      this.ctx.fillText(line1, node.x, node.y + 8);
    }

    this.ctx.restore();
  }

  // Animation Loop
  animate() {
    this.updatePhysics();
    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  // --- Interaction Event Handlers ---
  initEvents() {
    this.canvas.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.handleEnd(e));

    this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleEnd(e));
    this.canvas.addEventListener('mouseleave', () => { this.draggedNode = null; });
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.adjustZoom(1.2));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.adjustZoom(0.8));
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => this.resetCamera());
  }

  adjustZoom(factor) {
    const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    const worldCenter = this.toWorldCoords(center.x, center.y);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    this.panX = center.x - worldCenter.x * this.zoom;
    this.panY = center.y - worldCenter.y * this.zoom;
  }

  handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const mouseX = e.clientX - this.canvas.getBoundingClientRect().left;
    const mouseY = e.clientY - this.canvas.getBoundingClientRect().top;
    
    const worldMouse = this.toWorldCoords(mouseX, mouseY);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    this.panX = mouseX - worldMouse.x * this.zoom;
    this.panY = mouseY - worldMouse.y * this.zoom;
  }

  handleStart(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;
    let isMultiTouch = false;

    if (e.touches) {
      if (e.touches.length === 2) {
        isMultiTouch = true;
        clientX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        clientY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this.touchStartDist = Math.sqrt(dx * dx + dy * dy);
        this.touchStartZoom = this.zoom;
      } else {
        clientX = e.touches[0].clientX - rect.left;
        clientY = e.touches[0].clientY - rect.top;
      }
    } else {
      clientX = e.clientX - rect.left;
      clientY = e.clientY - rect.top;
    }

    const world = this.toWorldCoords(clientX, clientY);

    if (!isMultiTouch) {
      const clickedNode = this.getActiveNodes().find(node => {
        const dx = node.x - world.x;
        const dy = node.y - world.y;
        return (dx * dx + dy * dy) < (node.radius * node.radius);
      });

      if (clickedNode) {
        this.draggedNode = clickedNode;
        this.dragStartX = world.x - clickedNode.x;
        this.dragStartY = world.y - clickedNode.y;
        this.hasMovedDrag = false;
      } else {
        this.isPanning = true;
        this.panStartX = clientX - this.panX;
        this.panStartY = clientY - this.panY;
      }
    }
  }

  handleMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches) {
      if (e.touches.length === 2 && this.touchStartDist) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const factor = dist / this.touchStartDist;
        
        clientX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        clientY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        
        const worldCenter = this.toWorldCoords(clientX, clientY);
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.touchStartZoom * factor));
        
        this.panX = clientX - worldCenter.x * this.zoom;
        this.panY = clientY - worldCenter.y * this.zoom;
        return;
      } else {
        clientX = e.touches[0].clientX - rect.left;
        clientY = e.touches[0].clientY - rect.top;
      }
    } else {
      clientX = e.clientX - rect.left;
      clientY = e.clientY - rect.top;
    }

    const world = this.toWorldCoords(clientX, clientY);

    if (this.draggedNode) {
      e.preventDefault();
      this.draggedNode.x = world.x - this.dragStartX;
      this.draggedNode.y = world.y - this.dragStartY;
      this.hasMovedDrag = true;
    } else if (this.isPanning) {
      e.preventDefault();
      this.panX = clientX - this.panStartX;
      this.panY = clientY - this.panStartY;
    }
  }

  handleEnd(e) {
    this.isPanning = false;
    this.touchStartDist = null;

    if (this.draggedNode) {
      if (!this.hasMovedDrag) {
        this.selectedNodeId = this.draggedNode.id;
        this.onNodeSelected(this.draggedNode);
      }
      this.draggedNode = null;
    }
  }
}
