/**
 * ACCNET // CONSTRUCTIVIST & GEOMETRIC BLUEPRINT CANVAS
 * - Architectural Coordinate Blueprint Grid
 * - Parallax Proun Geometric Floating Solids
 */

class ConstructivistBlueprintCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = 0;
        this.height = 0;
        this.mouse = { x: -1000, y: -1000, targetX: -1000, targetY: -1000, isInside: false };
        this.time = 0;

        // Abstract Proun solids floating in space
        this.solids = [
            // Acute Carmine Red Wedge
            { type: 'wedge', xRatio: 0.12, yRatio: 0.25, size: 140, angle: -0.38, rotSpeed: 0.0008, color: '#E62B1E' },
            // Suprematist Carbon Black Frame
            { type: 'box', xRatio: 0.88, yRatio: 0.20, size: 90, angle: 0.24, rotSpeed: -0.0006, color: '#121314' },
            // Ochre Gold Caliper Arc Sector
            { type: 'circle', xRatio: 0.85, yRatio: 0.75, size: 110, angle: 0, rotSpeed: 0.0012, color: '#E5A91A' },
            // Industrial Diagonal Girder
            { type: 'beam', xRatio: 0.08, yRatio: 0.80, length: 280, angle: -0.78, rotSpeed: 0.0004, color: '#E62B1E' },
            // Constructivist Cross Tick
            { type: 'cross', xRatio: 0.50, yRatio: 0.08, size: 40, angle: 0.15, rotSpeed: 0.0005, color: '#85898E' }
        ];

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        window.addEventListener('mousemove', (e) => {
            this.mouse.targetX = e.clientX;
            this.mouse.targetY = e.clientY;
            this.mouse.isInside = true;
        });

        window.addEventListener('mouseleave', () => {
            this.mouse.isInside = false;
        });

        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches[0]) {
                this.mouse.targetX = e.touches[0].clientX;
                this.mouse.targetY = e.touches[0].clientY;
                this.mouse.isInside = true;
            }
        }, { passive: true });

        window.addEventListener('touchend', () => {
            this.mouse.isInside = false;
        }, { passive: true });

        const loop = (t) => {
            this.time = t * 0.001;
            this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = Math.floor(this.width * this.dpr);
        this.canvas.height = Math.floor(this.height * this.dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.ctx.resetTransform();
        this.ctx.scale(this.dpr, this.dpr);
    }

    render() {
        const ctx = this.ctx;
        const gridColor = 'rgba(18, 19, 20, 0.06)';
        const tickColor = 'rgba(18, 19, 20, 0.22)';

        // Smooth mouse lerping
        this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.12;
        this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.12;

        ctx.clearRect(0, 0, this.width, this.height);

        // 1. Architectural Blueprint Grid
        const gridSize = 64;
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;

        ctx.beginPath();
        for (let x = 0; x < this.width; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
        }
        for (let y = 0; y < this.height; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
        }
        ctx.stroke();

        // 2. Coordinate crosshairs (+) and grid ticks
        const majorGrid = gridSize * 3;
        ctx.fillStyle = tickColor;
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1;
        ctx.font = "9px 'JetBrains Mono', monospace";

        for (let x = majorGrid; x < this.width; x += majorGrid) {
            for (let y = majorGrid; y < this.height; y += majorGrid) {
                ctx.beginPath();
                ctx.moveTo(x - 5, y);
                ctx.lineTo(x + 5, y);
                ctx.moveTo(x, y - 5);
                ctx.lineTo(x, y + 5);
                ctx.stroke();

                if ((x + y) % (majorGrid * 2) === 0) {
                    const padX = x.toString().padStart(4, '0');
                    const padY = y.toString().padStart(4, '0');
                    ctx.fillText(`${padX}:${padY}`, x + 6, y - 4);
                }
            }
        }

        // 3. Parallax Floating Proun Solids
        const mouseParallaxX = (this.mouse.x - this.width / 2) * 0.025;
        const mouseParallaxY = (this.mouse.y - this.height / 2) * 0.025;

        this.solids.forEach((solid) => {
            ctx.save();
            const posX = (this.width * solid.xRatio) + mouseParallaxX;
            const posY = (this.height * solid.yRatio) + mouseParallaxY;
            const currentAngle = solid.angle + (this.time * solid.rotSpeed * 10);

            ctx.translate(posX, posY);
            ctx.rotate(currentAngle);

            if (solid.type === 'wedge') {
                ctx.fillStyle = solid.color;
                ctx.globalAlpha = 0.16;
                ctx.beginPath();
                ctx.moveTo(0, -solid.size * 0.8);
                ctx.lineTo(solid.size * 0.45, solid.size * 0.6);
                ctx.lineTo(-solid.size * 0.45, solid.size * 0.6);
                ctx.closePath();
                ctx.fill();

                ctx.strokeStyle = solid.color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.45;
                ctx.stroke();

            } else if (solid.type === 'box') {
                ctx.strokeStyle = solid.color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.35;
                ctx.strokeRect(-solid.size / 2, -solid.size / 2, solid.size, solid.size);

                ctx.beginPath();
                ctx.moveTo(-solid.size / 2, -solid.size / 2);
                ctx.lineTo(solid.size / 2, solid.size / 2);
                ctx.stroke();

            } else if (solid.type === 'circle') {
                ctx.strokeStyle = solid.color;
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.30;
                ctx.beginPath();
                ctx.arc(0, 0, solid.size / 2, 0, Math.PI * 1.4);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, solid.size / 3, Math.PI * 0.5, Math.PI * 1.8);
                ctx.setLineDash([4, 4]);
                ctx.stroke();

            } else if (solid.type === 'beam') {
                ctx.strokeStyle = solid.color;
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.25;
                ctx.beginPath();
                ctx.moveTo(-solid.length / 2, 0);
                ctx.lineTo(solid.length / 2, 0);
                ctx.stroke();

                ctx.lineWidth = 1;
                for (let i = -solid.length / 2 + 20; i < solid.length / 2; i += 25) {
                    ctx.beginPath();
                    ctx.moveTo(i, -6);
                    ctx.lineTo(i, 6);
                    ctx.stroke();
                }

            } else if (solid.type === 'cross') {
                ctx.strokeStyle = solid.color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.4;
                ctx.beginPath();
                ctx.moveTo(-solid.size / 2, 0);
                ctx.lineTo(solid.size / 2, 0);
                ctx.moveTo(0, -solid.size / 2);
                ctx.lineTo(0, solid.size / 2);
                ctx.stroke();
            }

            ctx.restore();
        });

        // 4. Architectural Perimeter Rulers
        ctx.save();
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < this.width; x += 16) {
            const h = (x % 64 === 0) ? 8 : (x % 32 === 0) ? 5 : 2;
            ctx.moveTo(x, 0); ctx.lineTo(x, h);
            ctx.moveTo(x, this.height); ctx.lineTo(x, this.height - h);
        }
        for (let y = 0; y < this.height; y += 16) {
            const w = (y % 64 === 0) ? 8 : (y % 32 === 0) ? 5 : 2;
            ctx.moveTo(0, y); ctx.lineTo(w, y);
            ctx.moveTo(this.width, y); ctx.lineTo(this.width - w, y);
        }
        ctx.stroke();
        ctx.restore();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ConstructivistBlueprintCanvas('constructivist-bg');
});
