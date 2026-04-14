// ==========================================
// 1. 数据源与配置 (Data & Config)
// ==========================================
const NEWS_SOURCE = [
    { cat: 'ECONOMY', title: "MARKET VOLATILITY SPIKES", summary: "Crypto assets plummeted 20% overnight following new regulatory announcements.", color: "#ffa502", isFake: false },
    { cat: 'ENV', title: "ICE SHELF COLLAPSE IMMINENT", summary: "Satellite imagery confirms the structural failure of the western shelf is accelerating.", color: "#ffffff", isFake: false },
    { cat: 'TECH', title: "AI ACHIEVES NEW REASONING", summary: "Latest benchmark tests show synthetic intelligence surpassing human capabilities.", color: "#2ed573", isFake: false },
    { cat: 'POLITICS', title: "GLOBAL SUMMIT ENDS IN SILENCE", summary: "Leaders failed to reach a consensus, leaving the future uncertain.", color: "#ff4757", isFake: false },
    // 假新闻数据 (isFake: true)
    { cat: 'UNKNOWN', title: "ALIENS LAND IN NEW YORK", summary: "Trust me bro, I saw it on TikTok.", color: "#ff0000", isFake: true },
    { cat: 'AD', title: "EARN $5000 A DAY FROM HOME", summary: "Click here to discover the secret the government is hiding from you.", color: "#ff0000", isFake: true }
];

const state = {
    platforms: [],
    lastX: 100,
    keys: {},
    gameStarted: false,
    isStomping: false, // 记录是否正在重踩
    spacePressed: false, // 新增：记录空格是否已被按下
    shouldJump: false    // 新增：跳跃指令指令
};

// DOM 元素缓存
const dom = {
    world: document.getElementById('game-world'),
    player: document.getElementById('player'),
    intro: document.getElementById('intro-overlay'),
    bgLayer: document.getElementById('background-layer'),
    bgMeta: document.getElementById('bg-meta'),
    bgTitle: document.getElementById('bg-title'),
    bgSummary: document.getElementById('bg-summary')
};

// ==========================================
// 2. 物理引擎初始化 (Matter.js Setup)
// ==========================================
const Engine = Matter.Engine,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Events = Matter.Events,
      Body = Matter.Body;

const engine = Engine.create();
const world = engine.world;
engine.gravity.y = 1.1; // 稍微调高重力，提升下落手感

// 创建玩家实体
const playerBody = Bodies.circle(200, 300, 20, {
    friction: 0,
    frictionAir: 0.01,
    inertia: Infinity, // 锁定旋转
    label: 'player'
});
Composite.add(world, playerBody);

// ==========================================
// 3. 核心机制：程序化生成 (Procedural Generation)
// ==========================================
function generatePlatform(x, y, isStart = false) {
    // 随机获取新闻，20%概率生成假新闻
    const isFakeRoll = Math.random() < 0.2 && !isStart;
    let data;
    
    if (isStart) {
        data = { cat: "SYSTEM", title: "BEGIN THE RUN", summary: "Stay moving. Smash the lies.", color: "#fff", isFake: false };
    } else if (isFakeRoll) {
        // 过滤出假新闻
        const fakes = NEWS_SOURCE.filter(n => n.isFake);
        data = fakes[Math.floor(Math.random() * fakes.length)];
    } else {
        // 过滤出真新闻
        const reals = NEWS_SOURCE.filter(n => !n.isFake);
        data = reals[Math.floor(Math.random() * reals.length)];
    }

    // 动态宽度：根据标题长度计算，限制在 150 - 500 之间
    const width = Math.min(Math.max(150, data.title.length * 15), 500);
    const height = 40;

    // 创建物理刚体
    const body = Bodies.rectangle(x, y, width, height, {
        isStatic: true,
        label: 'platform',
        plugin: { data: data } // 绑定数据到物理块上
    });

    // 创建 DOM 元素
    const el = document.createElement('div');
    el.className = 'platform';
    if (data.isFake) el.classList.add('fake'); // 假新闻附加闪烁 CSS
    
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.borderTopColor = data.color;
    el.innerText = data.cat;
    
    dom.world.appendChild(el);
    Composite.add(world, body);

    state.platforms.push({ body, dom: el, active: false, destroyed: false });
    return { width, x, y };
}

// 初始生成一段地形
generatePlatform(200, 500, true);
for(let i=0; i<6; i++) extendMap();

function extendMap() {
    const gap = 150 + Math.random() * 200; // X轴间距
    const yChange = (Math.random() * 300) - 150; // Y轴高低差
    let nextY = Math.max(200, Math.min(500 + yChange, 700)); // 限制在可视范围内
    let nextX = state.lastX + gap + 200;

    const p = generatePlatform(nextX, nextY);
    state.lastX = p.x + (p.width / 2);
}

// ==========================================
// 4. 交互与碰撞逻辑 (Interaction & Collisions)
// ==========================================
Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach(pair => {
        const other = pair.bodyA.label === 'player' ? pair.bodyB : pair.bodyA;
        
        if (other.label === 'platform') {
            const pObj = state.platforms.find(p => p.body === other);
            if (!pObj || pObj.destroyed) return;

            const isFakeNews = pObj.body.plugin.data.isFake;

            // 机制 A：玩家正在执行“重踩”
            if (state.isStomping) {
                if (isFakeNews) {
                    // 成功：踩碎假新闻
                    triggerShatter(pObj);
                    // 给予向上弹力奖励
                    Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -15 });
                } else {
                    // 惩罚：误踩真新闻（简单震动反馈，取消弹力）
                    pObj.dom.style.transform += ' translateY(10px)';
                }
            } 
            // 机制 B：玩家正常降落
            else {
                if (isFakeNews) {
                    // 惩罚：轻信假新闻，直接崩塌
                    triggerCorruption(pObj);
                } else {
                    // 正常：阅读新闻
                    pObj.active = true;
                    pObj.dom.classList.add('active');
                    pObj.dom.style.backgroundColor = pObj.body.plugin.data.color;
                    updateBackground(other.plugin.data);
                }
            }
        }
    });
});

Events.on(engine, 'collisionEnd', (event) => {
    event.pairs.forEach(pair => {
        const other = pair.bodyA.label === 'player' ? pair.bodyB : pair.bodyA;
        if (other.label === 'platform') {
            const pObj = state.platforms.find(p => p.body === other);
            // 离开后，平台崩塌（过眼云烟机制）
            if (pObj && pObj.active && !pObj.destroyed) {
                setTimeout(() => triggerDecay(pObj), 150);
            }
        }
    });
});

// --- 视觉更新函数 ---
function updateBackground(data) {
    document.body.classList.add('reading-mode');
    
    // 注入当前新闻类别颜色
    document.documentElement.style.setProperty('--active-color', data.color);
    
    dom.bgMeta.innerText = `${data.cat} // ${new Date().toLocaleTimeString()}`;
    dom.bgMeta.style.color = data.color;
    
    dom.bgTitle.innerText = data.title;
    dom.bgSummary.innerText = data.summary;
    dom.bgSummary.style.borderColor = data.color;
}

function triggerShatter(pObj) {
    pObj.destroyed = true;
    Composite.remove(world, pObj.body); // 移除物理实体
    pObj.dom.classList.add('shatter');  // 触发碎裂 CSS
    setTimeout(() => pObj.dom.remove(), 500);
}

function triggerCorruption(pObj) {
    // 假新闻腐蚀：屏幕闪红并立刻掉落
    document.body.style.backgroundColor = '#300';
    setTimeout(() => document.body.style.backgroundColor = 'var(--bg-color)', 200);
    triggerDecay(pObj);
}

function triggerDecay(pObj) {
    if (pObj.destroyed) return;
    pObj.destroyed = true;
    pObj.active = false;
    
    Composite.remove(world, pObj.body);
    pObj.dom.classList.remove('active');
    
    // CSS 掉落动画
    pObj.dom.style.transition = 'transform 1s ease-in, opacity 1s';
    pObj.dom.style.transform = `translate(${pObj.body.position.x}px, ${pObj.body.position.y + 500}px) rotate(45deg)`;
    pObj.dom.style.opacity = '0';
    
    setTimeout(() => {
        if(pObj.dom.parentNode) pObj.dom.remove();
    }, 1000);
}

// ==========================================
// 5. 输入处理与主循环 (Input & Game Loop)
// ==========================================
window.addEventListener('keydown', (e) => {
    if (!state.gameStarted) {
        state.gameStarted = true;
        dom.intro.style.opacity = '0';
        setTimeout(() => dom.intro.style.display = 'none', 500);
    }
    if (e.code === 'Space' && !state.spacePressed) {
        state.spacePressed = true;
        state.shouldJump = true; // 仅在按下的瞬间设为 true
    }
    state.keys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        state.spacePressed = false; // 松开后解锁，允许下一次跳跃
    }
    state.keys[e.code] = false;
});

const runner = Runner.create();
Runner.run(runner, engine);

function gameLoop() {
    if (!state.gameStarted) {
        requestAnimationFrame(gameLoop);
        return;
    }

    const speed = 7;
    const jumpForce = 14;

    // A. 左右移动
    if (state.keys['KeyA'] || state.keys['ArrowLeft']) {
        Body.setVelocity(playerBody, { x: -speed, y: playerBody.velocity.y });
    } else if (state.keys['KeyD'] || state.keys['ArrowRight']) {
        Body.setVelocity(playerBody, { x: speed, y: playerBody.velocity.y });
    }

    // B. 跳跃
    if (state.shouldJump) {
        // 执行跳跃判定
        if (Math.abs(playerBody.velocity.y) < 0.1) {
            Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -jumpForce });
        }
        state.shouldJump = false; // 消费掉这次跳跃指令，防止连跳
    }

    // C. 重踩 (Stomp) - 新增机制
    if (state.keys['KeyS'] || state.keys['ArrowDown']) {
        // 只有在空中且没有正在重踩时触发
        if (Math.abs(playerBody.velocity.y) > 0.5 && !state.isStomping) {
            Body.setVelocity(playerBody, { x: 0, y: 25 }); // 极速下坠
            state.isStomping = true;
            dom.player.classList.add('stomping'); // 添加视觉拖影
        }
    } else if (Math.abs(playerBody.velocity.y) < 0.1) {
        // 落地后恢复状态
        state.isStomping = false;
        dom.player.classList.remove('stomping');
    }

    // 同步玩家 DOM (注意 Matter.js 坐标是中心，CSS 也需要 transform(-50%, -50%))
    const px = playerBody.position.x;
    const py = playerBody.position.y;
    dom.player.style.transform = `translate(${px - 20}px, ${py - 20}px)`;

    // 同步未销毁平台的 DOM
    state.platforms.forEach(p => {
        if (!p.destroyed) {
            const w = p.body.bounds.max.x - p.body.bounds.min.x;
            const h = p.body.bounds.max.y - p.body.bounds.min.y;
            p.dom.style.transform = `translate(${p.body.position.x - w/2}px, ${p.body.position.y - h/2}px)`;
        }
    });

    // 镜头跟随：反向移动世界容器
    const cameraX = -px + window.innerWidth * 0.3; // 保持玩家在屏幕左侧 30%
    dom.world.style.transform = `translateX(${cameraX}px)`;

    // 无限生成
    if (state.lastX - px < window.innerWidth * 1.5) {
        extendMap();
    }

    // 掉落重生
    if (playerBody.position.y > 1000) {
        const safeP = state.platforms.find(p => !p.destroyed && p.body.position.x > px);
        const respawnX = safeP ? safeP.body.position.x : px - 300;
        
        Body.setPosition(playerBody, { x: respawnX, y: 0 });
        Body.setVelocity(playerBody, { x: 0, y: 0 });
        
        document.body.classList.remove('reading-mode');
        state.isStomping = false;
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();