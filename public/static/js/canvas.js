/**
 * ACCNET // CONSTRUCTIVIST & GEOMETRIC BLUEPRINT CANVAS
 * - Architectural Coordinate Blueprint Grid
 * - Autonomous Random Floating Proun Geometric Solids
 */

class ConstructivistBlueprintCanvas {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.width = 0;
        this.height = 0;
        this.time = 0;

        // Abstract Proun solids floating randomly in space
        this.solids = [
            // Acute Constructivist Blue Wedge
            {
                type: 'wedge',
                xRatio: 0.12,
                yRatio: 0.25,
                size: 140,
                angle: -0.38,
                rotSpeed: 0.0008,
                color: '#0084DD',
                floatSpeedX: 0.32,
                floatSpeedY: 0.38,
                floatAmpX: 45,
                floatAmpY: 35,
                phaseX: 0.7,
                phaseY: 2.1
            },
            // Suprematist Carbon Black Frame
            {
                type: 'box',
                xRatio: 0.88,
                yRatio: 0.20,
                size: 90,
                angle: 0.24,
                rotSpeed: -0.0006,
                color: '#121314',
                floatSpeedX: 0.26,
                floatSpeedY: 0.34,
                floatAmpX: 38,
                floatAmpY: 48,
                phaseX: 3.2,
                phaseY: 1.4
            },
            // Electric Cyan Caliper Arc Sector
            {
                type: 'circle',
                xRatio: 0.85,
                yRatio: 0.75,
                size: 110,
                angle: 0,
                rotSpeed: 0.0012,
                color: '#00B4D8',
                floatSpeedX: 0.40,
                floatSpeedY: 0.28,
                floatAmpX: 50,
                floatAmpY: 40,
                phaseX: 1.8,
                phaseY: 4.2
            },
            // Industrial Diagonal Girder
            {
                type: 'beam',
                xRatio: 0.08,
                yRatio: 0.80,
                length: 280,
                angle: -0.78,
                rotSpeed: 0.0004,
                color: '#0084DD',
                floatSpeedX: 0.22,
                floatSpeedY: 0.25,
                floatAmpX: 32,
                floatAmpY: 36,
                phaseX: 5.0,
                phaseY: 0.6
            },
            // Constructivist Cross Tick
            {
                type: 'cross',
                xRatio: 0.50,
                yRatio: 0.08,
                size: 40,
                angle: 0.15,
                rotSpeed: 0.0005,
                color: '#85898E',
                floatSpeedX: 0.36,
                floatSpeedY: 0.44,
                floatAmpX: 38,
                floatAmpY: 30,
                phaseX: 2.5,
                phaseY: 3.8
            }
        ];

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

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
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(18, 19, 20, 0.06)';
        const tickColor = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(18, 19, 20, 0.22)';

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

        // 3. Autonomous Random Floating Proun Solids
        this.solids.forEach((solid) => {
            ctx.save();

            // Aperiodic harmonic floating trajectory (smooth, organic random drift)
            const floatX = Math.sin(this.time * solid.floatSpeedX + solid.phaseX) * solid.floatAmpX
                         + Math.cos(this.time * solid.floatSpeedX * 0.61 + solid.phaseY) * (solid.floatAmpX * 0.45);
            const floatY = Math.cos(this.time * solid.floatSpeedY + solid.phaseY) * solid.floatAmpY
                         + Math.sin(this.time * solid.floatSpeedY * 0.73 + solid.phaseX) * (solid.floatAmpY * 0.45);

            const posX = (this.width * solid.xRatio) + floatX;
            const posY = (this.height * solid.yRatio) + floatY;
            const currentAngle = solid.angle + (this.time * solid.rotSpeed * 10);

            ctx.translate(posX, posY);
            ctx.rotate(currentAngle);

            let solidColor = solid.color;
            if (isDark) {
                if (solidColor === '#121314') solidColor = '#94A3B8';
                else if (solidColor === '#85898E') solidColor = '#CBD5E1';
            }

            if (solid.type === 'wedge') {
                ctx.fillStyle = solidColor;
                ctx.globalAlpha = 0.16;
                ctx.beginPath();
                ctx.moveTo(0, -solid.size * 0.8);
                ctx.lineTo(solid.size * 0.45, solid.size * 0.6);
                ctx.lineTo(-solid.size * 0.45, solid.size * 0.6);
                ctx.closePath();
                ctx.fill();

                ctx.strokeStyle = solidColor;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.45;
                ctx.stroke();

            } else if (solid.type === 'box') {
                ctx.strokeStyle = solidColor;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.35;
                ctx.strokeRect(-solid.size / 2, -solid.size / 2, solid.size, solid.size);

                ctx.beginPath();
                ctx.moveTo(-solid.size / 2, -solid.size / 2);
                ctx.lineTo(solid.size / 2, solid.size / 2);
                ctx.stroke();

            } else if (solid.type === 'circle') {
                ctx.strokeStyle = solidColor;
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
                ctx.strokeStyle = solidColor;
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
                ctx.strokeStyle = solidColor;
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
