// ==========================================
// 1. 数据源与配置 (Data & Config)
// ==========================================

const FAKE_NEWS = [
    { cat: 'UNKNOWN', title: "ALIENS LAND IN NEW YORK", summary: "Trust me bro, I saw it on TikTok.", color: "#ff0000", isFake: true },
    { cat: 'AD', title: "EARN $5000 A DAY FROM HOME", summary: "Click here to discover the secret the government is hiding from you.", color: "#ff0000", isFake: true }
];

const REAL_NEWS_FALLBACK = [
    { cat: 'ECONOMY', title: "MARKET VOLATILITY SPIKES", summary: "Crypto assets plummeted 20% overnight following new regulatory announcements.", color: "#ffa502", isFake: false },
    { cat: 'ENV', title: "ICE SHELF COLLAPSE IMMINENT", summary: "Satellite imagery confirms the structural failure of the western shelf is accelerating.", color: "#ffffff", isFake: false },
    { cat: 'TECH', title: "AI ACHIEVES NEW REASONING", summary: "Latest benchmark tests show synthetic intelligence surpassing human capabilities.", color: "#2ed573", isFake: false },
    { cat: 'POLITICS', title: "GLOBAL SUMMIT ENDS IN SILENCE", summary: "Leaders failed to reach a consensus, leaving the future uncertain.", color: "#a29bfe", isFake: false },
];

let NEWS_SOURCE = [...REAL_NEWS_FALLBACK, ...FAKE_NEWS];

const RSS_FEEDS = [
    { cat: 'ECONOMY', color: '#ffa502', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
    { cat: 'ENV',     color: '#ffffff', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
    { cat: 'TECH',    color: '#2ed573', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml' },
    { cat: 'POLITICS',color: '#a29bfe', url: 'https://feeds.bbci.co.uk/news/politics/rss.xml' },
];

function stripHtml(str) {
    return str.replace(/<[^>]*>/g, '').trim();
}

async function loadNews() {
    const results = await Promise.all(RSS_FEEDS.map(feed =>
        fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`)
            .then(r => r.json())
            .then(data => {
                if (data.status !== 'ok') return [];
                return data.items.map(item => {
                    const summary = stripHtml(item.description);
                    return {
                        cat: feed.cat,
                        title: item.title.toUpperCase(),
                        summary: summary.length > 150 ? summary.slice(0, 147) + '...' : summary,
                        color: feed.color,
                        isFake: false
                    };
                });
            })
            .catch(() => [])
    ));
    const realNews = results.flat().filter(n => n.title && n.summary);
    if (realNews.length > 0) NEWS_SOURCE = [...realNews, ...FAKE_NEWS];
}

loadNews();


const state = {
    platforms: [],
    lastX: 100,
    lastY: window.innerWidth < 600 ? 400 : 600,
    keys: {},
    gameStarted: false,
    isStomping: false,   // 记录是否正在重踩
    stompLocked: false,  // 踩碎后锁定，松开 S/↓ 才解锁，防止弹跳中途意外重触
    isRespawning: false, // 重生下落阶段，禁止自动前进
    spacePressed: false,
    shouldJump: false,
    score: 8,
    gameOver: false
};

// DOM 元素缓存
const dom = {
    world: document.getElementById('game-world'),
    player: document.getElementById('player'),
    intro: document.getElementById('intro-overlay'),
    bgLayer: document.getElementById('background-layer'),
    bgMeta: document.getElementById('bg-meta'),
    bgTitle: document.getElementById('bg-title'),
    bgSummary: document.getElementById('bg-summary'),
    scoreEl: document.getElementById('score-display')
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
function generatePlatform(x, y, isStart = false, isFake = null) {
    const isFakeRoll = isStart ? false : (isFake !== null ? isFake : Math.random() < 0.2);
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
generatePlatform(200, window.innerWidth < 600 ? 400 : 600, true);
for(let i=0; i<6; i++) extendMap();

function extendMap() {
    const gap = 250 + Math.random() * 220;
    const isFake = Math.random() < 0.2;

    const mobile = window.innerWidth < 600;
    const targetY = mobile
        ? 250 + Math.random() * 300  // 手机：250-550，整体靠上
        : 400 + Math.random() * 350; // 桌面：400-750
    const maxUp   = isFake ? 50 : 100;
    const maxDown = 320;
    const rawY = Math.max(state.lastY - maxUp, Math.min(targetY, state.lastY + maxDown));
    const nextY = mobile
        ? Math.max(180, Math.min(rawY, 580))
        : Math.max(300, Math.min(rawY, 750));
    let nextX = state.lastX + gap + 200;

    const p = generatePlatform(nextX, nextY, false, isFake);
    state.lastX = p.x + (p.width / 2);
    state.lastY = nextY;
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
            state.isRespawning = false; // 落到任意平台即结束重生状态，恢复自动前进

            const isFakeNews = pObj.body.plugin.data.isFake;

            // 机制 A：玩家正在执行”重踩”
            if (state.isStomping) {
                if (isFakeNews) {
                    // 成功：踩碎假新闻
                    triggerShatter(pObj);
                    // 给予向上弹力奖励
                    Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -15 });
                    // 清除重踩状态并锁定，必须松开 S/↓ 键才能再次重踩
                    state.isStomping = false;
                    state.stompLocked = true;
                    dom.player.classList.remove('stomping');
                } else {
                    // 惩罚：误踩真新闻，平台碎裂但不给弹力
                    pObj.destroyed = true;
                    Composite.remove(world, pObj.body);
                    pObj.dom.classList.add('shatter');
                    setTimeout(() => pObj.dom.remove(), 500);
                    state.isStomping = false;
                    state.stompLocked = true;
                    dom.player.classList.remove('stomping');
                }
            } 
            // 机制 B：玩家正常降落
            else {
                if (isFakeNews) {
                    // 惩罚：轻信假新闻，直接崩塌
                    triggerCorruption(pObj);
                } else {
                    // 正常：阅读新闻，落地即加分
                    pObj.active = true;
                    pObj.dom.classList.add('active');
                    pObj.dom.style.backgroundColor = pObj.body.plugin.data.color;
                    updateBackground(other.plugin.data);
                    addScore(1);
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
            // 离开后触发衰减；triggerDecay 内部已处理 active 状态判断加分
            // 不依赖 pObj.active，避免重踩路径下平台永不消失
            if (pObj && !pObj.destroyed) {
                setTimeout(() => triggerDecay(pObj), 150);
            }
        }
    });
});

// --- 评分系统 ---
function showScorePopup(delta, x, y) {
    const popup = document.createElement('div');
    popup.className = 'score-popup';
    popup.textContent = delta > 0 ? `+${delta}` : `${delta}`;
    popup.style.color = delta < 0 ? '#ff4757' : delta >= 3 ? '#ffa502' : '#2ed573';
    popup.style.left = `${x - 15}px`;
    popup.style.top = `${y - 40}px`;
    dom.world.appendChild(popup);
    setTimeout(() => popup.remove(), 900);
}

function addScore(delta) {
    state.score += delta;
    dom.scoreEl.textContent = state.score;
    showScorePopup(delta, playerBody.position.x, playerBody.position.y);
}

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
    addScore(4); // 踩碎假新闻 +4
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
// 腾空双击（键盘/触屏共用）：记录腾空中第一次按下的时间
let airPressTime = 0;
const AIR_DOUBLE_MS = 350;

function tryStompDoublePress() {
    if (!state.isStomping && !state.stompLocked) {
        const now = Date.now();
        if (airPressTime > 0 && now - airPressTime < AIR_DOUBLE_MS) {
            // 第二击 → 触发重踩
            airPressTime = 0;
            Body.setVelocity(playerBody, { x: 0, y: 25 });
            state.isStomping = true;
            dom.player.classList.add('stomping');
        } else {
            // 第一击 → 记录时间，等待第二击
            airPressTime = now;
        }
    }
}

window.addEventListener('keydown', (e) => {
    if (!state.gameStarted) {
        state.gameStarted = true;
        dom.intro.style.opacity = '0';
        setTimeout(() => dom.intro.style.display = 'none', 500);
        return;
    }
    if (e.code === 'Space' && !state.spacePressed) {
        state.spacePressed = true;
        if (Math.abs(playerBody.velocity.y) < 0.1) {
            state.shouldJump = true; // 落地 → 跳跃
            airPressTime = 0;
        } else {
            tryStompDoublePress(); // 腾空 → 尝试双击重踩
        }
    }
    state.keys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') state.spacePressed = false;
    state.keys[e.code] = false;
});

// ==========================================
// 触屏支持 (Mobile Touch)
// ==========================================
document.addEventListener('touchstart', (e) => {
    if (e.target.id === 'about-link') return;
    e.preventDefault();
    if (!state.gameStarted) {
        state.gameStarted = true;
        dom.intro.style.opacity = '0';
        setTimeout(() => dom.intro.style.display = 'none', 500);
        return;
    }
    if (Math.abs(playerBody.velocity.y) < 0.1) {
        state.shouldJump = true; // 落地 → 跳跃，零延迟
        airPressTime = 0;
    } else {
        tryStompDoublePress(); // 腾空 → 尝试双击重踩
    }
}, { passive: false });

const runner = Runner.create();
Runner.run(runner, engine);

function triggerGameOver() {
    state.gameOver = true;
    const overlay = document.createElement('div');
    overlay.id = 'game-over-overlay';
    overlay.innerHTML = `
        <h1>GAME OVER</h1>
        <p class="go-subtitle">YOUR CREDIBILITY COLLAPSED</p>
        <p class="go-restart">PRESS ANY KEY TO RESTART</p>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => {
        const restart = () => location.reload();
        window.addEventListener('keydown', restart, { once: true });
        document.addEventListener('touchstart', restart, { once: true });
    }, 600);
}

function gameLoop() {
    if (!state.gameStarted) {
        requestAnimationFrame(gameLoop);
        return;
    }
    if (state.gameOver) return;

    const speed = 7;
    const jumpForce = 14;

    // A. 移动：默认自动向右，左键可反向；重生下落阶段锁定 x 不移动
    // 只直接写 x 轴，不调用 setVelocity，避免同时覆盖 positionPrev.y 干扰 y 轴 Verlet 积分
    if (!state.isRespawning) {
        playerBody.velocity.x = speed;
        playerBody.positionPrev.x = playerBody.position.x - speed;
    }

    // B. 跳跃
    if (state.shouldJump) {
        // 执行跳跃判定
        if (Math.abs(playerBody.velocity.y) < 0.1) {
            Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -jumpForce });
        }
        state.shouldJump = false; // 消费掉这次跳跃指令，防止连跳
    }

    // C. 落地后重置重踩状态
    if (Math.abs(playerBody.velocity.y) < 0.1) {
        state.isStomping = false;
        state.stompLocked = false;
        airPressTime = 0;
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
        const penalty = Math.floor(state.score * 2 / 3) + 2;
        state.score -= penalty;
        dom.scoreEl.textContent = state.score;

        if (state.score < 0) {
            triggerGameOver();
            return;
        }

        const safeP = state.platforms.find(p => !p.destroyed && p.body.position.x > px);
        const respawnX = safeP ? safeP.body.position.x : px + 200;
        Body.setPosition(playerBody, { x: respawnX, y: 0 });
        Body.setVelocity(playerBody, { x: 0, y: 0 });
        showScorePopup(-penalty, respawnX, 80); // 在复活点顶部显示，随玩家下落可见
        state.isRespawning = true;
        document.body.classList.remove('reading-mode');
        state.isStomping = false;
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();