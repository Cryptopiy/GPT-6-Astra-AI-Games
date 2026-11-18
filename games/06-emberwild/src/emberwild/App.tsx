import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { BIOMES, ITEMS, RECIPES, STATION_NAMES, TILE } from "./data";
import { GameState } from "./state";
import { Bridge, WildScene } from "./Scene";
import "./styles.css";

export function EmberwildApp() {
  const mount = useRef<HTMLDivElement>(null),
    bridgeRef = useRef<Bridge | null>(null);
  if (!bridgeRef.current)
    bridgeRef.current = {
      state: GameState.load(),
      scene: null,
      icons: {},
      refresh: () => {},
      guideOpen: false,
      helpOpen: false,
      confirmOpen: false,
    };
  const bridge = bridgeRef.current,
    s = bridge.state;
  const [, update] = useState(0),
    [tab, setTab] = useState<"craft" | "bag">("craft"),
    [filter, setFilter] = useState("all"),
    [held, setHeld] = useState<number | null>(null),
    [newWorld, setNewWorld] = useState(false),
    [seed, setSeed] = useState(""),
    [notice, setNotice] = useState("");
  const refresh = () => update((n) => n + 1);
  bridge.refresh = refresh;
  bridge.confirmOpen = newWorld;
  bridge.closeConfirm = () => {
    bridge.confirmOpen = false;
    setNewWorld(false);
  };
  useEffect(() => {
    document.title = "EMBERWILD — под корнями мира";
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount.current!,
      backgroundColor: "#80b5bb",
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: mount.current!.clientWidth,
        height: mount.current!.clientHeight,
      },
      scene: [new WildScene(bridge)],
      input: { mouse: { preventDefaultWheel: true } },
      render: { powerPreference: "high-performance" },
      audio: { noAudio: true },
    });
    return () => {
      bridge.state.save();
      game.destroy(true);
    };
  }, []);
  const p = s.player,
    scene = bridge.scene,
    inv = s.inventory,
    biome = BIOMES[s.world.biome(p.x / TILE)],
    depth = s.world.depth(p.y / TILE),
    stations = s.stations,
    current = inv.current,
    boss = scene?.combat.boss;
  const clockMinutes = Math.floor(
      ((((s.time % 720) / 720) * 24 + 6) % 24) * 60,
    ),
    timeLabel = `${String(Math.floor(clockMinutes / 60)).padStart(2, "0")}:${String(clockMinutes % 60).padStart(2, "0")}`;
  const icon = (id: string, className = "") =>
    bridge.icons[id] ? (
      <img
        className={`item-icon ${className}`}
        src={bridge.icons[id]}
        alt=""
        draggable={false}
      />
    ) : (
      <span
        className={`item-fallback ${className}`}
        style={{ color: ITEMS[id].color }}
      >
        ◆
      </span>
    );
  const toggleInventory = () => {
    s.inventoryOpen = !s.inventoryOpen;
    bridge.guideOpen = false;
    setHeld(null);
    refresh();
  };
  const save = () => {
    s.save();
    setNotice(s.saveError || "Мир сохранён");
    setTimeout(() => setNotice(""), 3000);
    refresh();
  };
  const progress = [
    {
      done: s.stats.mined >= 8,
      text: "Заготовьте древесину",
      sub: "Топор · стволы деревьев",
    },
    {
      done:
        inv.count("workbench") > 0 ||
        stations.has("workbench") ||
        Object.values(s.world.changes).includes(14),
      text: "Соберите верстак",
      sub: "E · ремесло · 10 древесины",
    },
    {
      done:
        inv.count("pick1") > 0 ||
        inv.count("pick2") > 0 ||
        inv.count("pick3") > 0,
      text: "Добудьте медь в пещерах",
      sub: "Печь → слитки → медная кирка",
    },
    {
      done: inv.count("pick2") > 0 || inv.count("pick3") > 0,
      text: "Откройте путь к люмениту",
      sub: "Железная кирка · глубже 65 м",
    },
    {
      done: s.bossDefeated,
      text: "Разбудите Стража Корней",
      sub: "Зов корней · на поверхности",
    },
  ];
  const next = progress.find((q) => !q.done) ?? {
    text: "Мир снова дышит",
    sub: "Создайте Рассветную ветвь на наковальне",
  };
  const slot = (index: number, big = false) => {
    const stack = inv.slots[index],
      def = stack ? ITEMS[stack.id] : null;
    return (
      <button
        key={index}
        className={`slot ${index === inv.selected ? "selected" : ""} ${held === index ? "held" : ""} ${big ? "bag-slot" : ""}`}
        title={def ? `${def.name}\n${def.description}` : "Пустая ячейка"}
        aria-label={`${index < 10 ? `Слот ${index + 1}` : `Ячейка ${index + 1}`}: ${def?.name ?? "пусто"}${stack ? ` ×${stack.count}` : ""}`}
        onClick={() => {
          if (big) {
            if (held === null) setHeld(index);
            else {
              inv.swap(held, index);
              setHeld(null);
            }
          } else inv.selected = index;
          refresh();
        }}
        onDoubleClick={() => {
          if (index >= 10 && inv.slots[index]) {
            inv.swap(index, inv.selected);
            setHeld(null);
            refresh();
          }
        }}
      >
        {index < 10 && <span className="slot-key">{(index + 1) % 10}</span>}
        {stack && icon(stack.id)}
        {stack && stack.count > 1 && (
          <span className="slot-quantity">{stack.count}</span>
        )}
        {def && def.kind === "pick" && (
          <span className="slot-tier">{"ⅠⅡⅢⅣ"[def.tier ?? 0]}</span>
        )}
      </button>
    );
  };
  return (
    <main
      className="ember-app"
      onClickCapture={() => {
        requestAnimationFrame(() => {
          if (bridge.scene && !bridge.scene.blocked)
            bridge.scene.game.canvas.focus({ preventScroll: true });
        });
      }}
    >
      <div
        ref={mount}
        className="world-canvas"
        aria-label="Игровой мир Emberwild"
      />
      <header className="masthead">
        <a className="wordmark" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-spark">✦</span> EMBERWILD
          <span className="brand-caption">ПОД КОРНЯМИ МИРА</span>
        </a>
        <div className="world-name">
          <span className="live-dot" /> МИР {s.world.seed}
          <span className="world-name-sep">/</span> ДЕНЬ{" "}
          {Math.floor(s.time / 720) + 1}
        </div>
        <div className="header-actions">
          <button
            title="Управление"
            onClick={() => {
              bridge.helpOpen = true;
              refresh();
            }}
          >
            ?
          </button>
          <button title="Сохранить мир" onClick={save}>
            Сохранить <span>↗</span>
          </button>
          <button
            className="pause-button"
            title="Пауза (Esc)"
            onClick={() => {
              s.paused = !s.paused;
              refresh();
            }}
          >
            {s.paused ? "▶" : "Ⅱ"}
          </button>
        </div>
      </header>
      <section className="vitals hud-panel">
        <div className="vitals-title">
          <span className="heart-symbol">♥</span>
          <span>СТРАННИК</span>
          <strong>
            {Math.ceil(p.hp)} <small>/ {p.maxHp}</small>
          </strong>
        </div>
        <div className="health-track">
          <div style={{ width: `${(p.hp / p.maxHp) * 100}%` }} />
        </div>
        <div className="vitals-meta">
          <span>⛨ Защита {s.defense}</span>
          <span>{p.boots ? "↟ Лёгкий шаг" : "H · выпить настой"}</span>
        </div>
      </section>
      <section className="location hud-panel">
        <div className="location-top">
          <span className="sun-symbol">{s.night ? "☾" : "☼"}</span>
          <span>
            {s.night ? "НОЧЬ" : "ДЕНЬ"} <b>{timeLabel}</b>
          </span>
          <span className="weather-dot" />
        </div>
        <strong>{biome.name}</strong>
        <div className="location-meta">
          <span>
            {depth === "surface"
              ? "Поверхность"
              : depth === "underground"
                ? "Подземелье"
                : "Глубинные пещеры"}
          </span>
          <span>↓ {Math.max(0, Math.floor(p.y / TILE - 35))} м</span>
        </div>
        <div className="mini-landscape">
          <span
            className="map-marker"
            style={{ left: `${(p.x / (480 * TILE)) * 100}%` }}
          >
            ◆
          </span>
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="biome-labels">
          <span>ЛЕС</span>
          <span>ДЮНЫ</span>
          <span>СНЕГ</span>
          <span>ЗАРОСЛИ</span>
        </div>
      </section>
      {!s.inventoryOpen &&
        !s.paused &&
        !bridge.guideOpen &&
        !bridge.helpOpen && (
          <aside className="journey">
            <span className="eyebrow">ПУТЬ СТРАННИКА</span>
            <div className="journey-title">
              <span>◇</span>
              {next.text}
            </div>
            <p>{next.sub}</p>
            <div className="journey-steps">
              {progress.map((q, i) => (
                <i key={i} className={q.done ? "done" : ""} />
              ))}
            </div>
            <button
              onClick={() => {
                bridge.guideOpen = true;
                refresh();
              }}
            >
              Полевой дневник <span>↗</span>
            </button>
          </aside>
        )}
      {boss && (
        <section className="boss-hud">
          <div>
            <span>✦</span>
            <strong>СТРАЖ КОРНЕЙ</strong>
            <span>
              {boss.phase === 2
                ? "ЯРОСТЬ ДРЕВНЕГО ЛЕСА"
                : "СЕРДЦЕ СПЯЩЕГО ЛЕСА"}
            </span>
          </div>
          <div className="boss-track">
            <i style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
          </div>
          <small>
            {Math.ceil(boss.hp)} / {boss.maxHp} ·{" "}
            {boss.warn > 0
              ? boss.attack === 0
                ? "Готовится залп"
                : boss.attack === 1
                  ? "Готовится рывок"
                  : "Отойдите от светлой полосы"
              : "Двигайтесь и целитесь в светящееся сердце"}
          </small>
        </section>
      )}
      <div className="toast-stack" role="status">
        {s.notices.slice(-3).map((n) => (
          <div key={n.id}>
            <span>✧</span>
            {n.text}
          </div>
        ))}
        {notice && <div>{notice}</div>}
        {s.saveError && <div className="error-toast">{s.saveError}</div>}
      </div>
      {!s.inventoryOpen && (
        <div className="crosshair-hint">
          {scene?.hint && (
            <>
              <span>+</span> {scene.hint}
            </>
          )}
        </div>
      )}
      <footer className="bottom-hud">
        <div className="selected-name">
          {current && (
            <>
              {ITEMS[current.id].name}
              <span>
                {ITEMS[current.id].kind === "block"
                  ? "ПКМ · разместить"
                  : ITEMS[current.id].kind === "bow"
                    ? "ЛКМ · стрелять"
                    : ITEMS[current.id].kind === "pick" ||
                        ITEMS[current.id].kind === "axe"
                      ? "Удерживайте ЛКМ · добывать"
                      : "ЛКМ · использовать"}
              </span>
            </>
          )}
        </div>
        <div className="hotbar-row">
          <div className="hotbar">
            {Array.from({ length: 10 }, (_, i) => slot(i))}
          </div>
          <button
            className={`inventory-button ${s.inventoryOpen ? "active" : ""}`}
            onClick={toggleInventory}
          >
            <span>▦</span>
            <kbd>E</kbd>
          </button>
        </div>
        <div className="control-strip">
          <span>
            <kbd>A</kbd>
            <kbd>D</kbd> идти
          </span>
          <span>
            <kbd>Space</kbd> прыжок
          </span>
          <span>
            <b>ЛКМ</b> добывать / атаковать
          </span>
          <span>
            <b>ПКМ</b> ставить / открыть
          </span>
          <span>
            <kbd>F</kbd> поговорить
          </span>
        </div>
      </footer>
      <div className="save-status">
        <i /> {s.savedAt ? `Сохранено ${s.savedAt}` : "Автосохранение · 20 сек"}
        {scene?.sheltered && <span>⌂ Убежище</span>}
      </div>
      {s.inventoryOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) toggleInventory();
          }}
        >
          <section className="inventory-modal">
            <div className="modal-header">
              <div>
                <span className="eyebrow">ВСЁ НУЖНОЕ В ПУТИ</span>
                <h1>Рюкзак и ремесло</h1>
              </div>
              <button className="close-button" onClick={toggleInventory}>
                × <kbd>E</kbd>
              </button>
            </div>
            <div className="inventory-columns">
              <div className="bag-panel">
                <div className="section-label">
                  РЮКЗАК <span>{inv.slots.filter(Boolean).length} / 40</span>
                </div>
                <div className="bag-grid">
                  {Array.from({ length: 40 }, (_, i) => slot(i, true))}
                </div>
                <p className="muted">
                  Нажмите две ячейки, чтобы поменять предметы местами. Верхний
                  ряд — панель быстрого доступа.
                </p>
                <div className="equipment">
                  <span>Снаряжение</span>
                  <div>
                    {p.armor ? icon(p.armor) : "⛨"}
                    <span>
                      {p.armor ? ITEMS[p.armor].name : "Походная одежда"}
                      <small>Защита {s.defense}</small>
                    </span>
                  </div>
                  <div>
                    <span>♥</span>
                    <span>
                      Здоровье {p.maxHp}
                      <small>
                        {p.boots
                          ? "Сапоги странника надеты"
                          : "Ищите янтарные сердца и сапоги в сундуках"}
                      </small>
                    </span>
                  </div>
                </div>
                {held !== null && inv.slots[held] && (
                  <div className="held-description">
                    <strong>{ITEMS[inv.slots[held]!.id].name}</strong>
                    <p>{ITEMS[inv.slots[held]!.id].description}</p>
                    <button
                      onClick={() => {
                        if (held >= 10) inv.swap(held, inv.selected);
                        else inv.selected = held;
                        setHeld(null);
                        refresh();
                      }}
                    >
                      На панель быстрого доступа
                    </button>{" "}
                    <button
                      onClick={() => {
                        s.dropSlot(held);
                        setHeld(null);
                        refresh();
                      }}
                    >
                      Выбросить
                    </button>
                  </div>
                )}
              </div>
              <div className="craft-panel">
                <div className="craft-tabs">
                  <button
                    className={tab === "craft" ? "active" : ""}
                    onClick={() => setTab("craft")}
                  >
                    Ремесло
                  </button>
                  <button
                    className={tab === "bag" ? "active" : ""}
                    onClick={() => setTab("bag")}
                  >
                    Путь к глубинам
                  </button>
                </div>
                {tab === "craft" ? (
                  <>
                    <div className="station-status">
                      <span className="active">✓ Вручную</span>
                      {Object.entries(STATION_NAMES).map(([key, name]) => (
                        <span
                          key={key}
                          className={stations.has(key) ? "active" : ""}
                        >
                          {stations.has(key) ? "✓" : "◇"} {name}
                        </span>
                      ))}
                    </div>
                    <div className="recipe-filters">
                      <button
                        className={filter === "all" ? "active" : ""}
                        onClick={() => setFilter("all")}
                      >
                        Все рецепты
                      </button>
                      <button
                        className={filter === "ready" ? "active" : ""}
                        onClick={() => setFilter("ready")}
                      >
                        Доступные
                      </button>
                      <button
                        className={filter === "gear" ? "active" : ""}
                        onClick={() => setFilter("gear")}
                      >
                        Снаряжение
                      </button>
                    </div>
                    <div className="recipe-list">
                      {RECIPES.filter((r) =>
                        filter === "ready"
                          ? inv.canCraft(r, stations)
                          : filter === "gear"
                            ? ["pick", "sword", "armor", "bow"].includes(
                                ITEMS[r.out].kind,
                              )
                            : true,
                      ).map((r) => {
                        const ready = inv.canCraft(r, stations);
                        return (
                          <div
                            className={`recipe ${ready ? "ready" : ""}`}
                            key={r.id}
                          >
                            <div className="recipe-icon">{icon(r.out)}</div>
                            <div className="recipe-info">
                              <strong>
                                {ITEMS[r.out].name}{" "}
                                {r.amount > 1 && <small>×{r.amount}</small>}
                              </strong>
                              <p>
                                {Object.entries(r.needs).map(([id, n]) => (
                                  <span
                                    className={
                                      inv.count(id) < n ? "missing" : ""
                                    }
                                    key={id}
                                  >
                                    {ITEMS[id].name}{" "}
                                    {Math.min(inv.count(id), n)}/{n}
                                  </span>
                                ))}
                              </p>
                              {r.station && !stations.has(r.station) && (
                                <small className="station-needed">
                                  Рядом: {STATION_NAMES[r.station]}
                                </small>
                              )}
                            </div>
                            <button
                              disabled={!ready}
                              title={
                                ready
                                  ? "Создать"
                                  : r.station && !stations.has(r.station)
                                    ? `Подойдите к станции: ${STATION_NAMES[r.station]}`
                                    : "Не хватает материалов"
                              }
                              onClick={() => {
                                s.craft(r);
                                refresh();
                              }}
                            >
                              Создать
                            </button>
                          </div>
                        );
                      })}
                      {filter === "ready" &&
                        !RECIPES.some((r) => inv.canCraft(r, stations)) && (
                          <p className="empty-state">
                            Пока не хватает материалов. Переключитесь на все
                            рецепты, чтобы увидеть, что собрать.
                          </p>
                        )}
                    </div>
                  </>
                ) : (
                  <div className="progression-list">
                    {progress.map((q, i) => (
                      <div key={q.text}>
                        <span className={q.done ? "done" : ""}>
                          {q.done ? "✓" : i + 1}
                        </span>
                        <div>
                          <strong>{q.text}</strong>
                          <p>{q.sub}</p>
                        </div>
                      </div>
                    ))}
                    <p>
                      Медь: галерея справа от лагеря. Железо: глубже. Люменит:
                      глубже 65 м. Факелы и платформы помогут вернуться.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      {bridge.guideOpen && (
        <div className="modal-backdrop">
          <section className="guide-modal">
            <button
              className="close-button"
              onClick={() => {
                bridge.guideOpen = false;
                refresh();
              }}
            >
              ×
            </button>
            <span className="eyebrow">ПОЛЕВОЙ ДНЕВНИК · ОРИН, ПРОВОДНИК</span>
            <h1>
              Всё начинается
              <br />с маленького костра.
            </h1>
            <p className="guide-intro">
              «Лес щедр к любопытным. Но под корнями спит нечто древнее. Сначала
              обзаведитесь хорошей киркой».
            </p>
            <div className="guide-grid">
              <article>
                <b>01 / ОБУСТРОЙТЕСЬ</b>
                <h3>Рубите и стройте</h3>
                <p>
                  Рубите стволы топором. В рюкзаке создайте верстак из 10
                  древесины. Выберите его на панели и поставьте ПКМ рядом с
                  землёй.
                </p>
              </article>
              <article>
                <b>02 / СПУСТИТЕСЬ</b>
                <h3>Следуйте за рудой</h3>
                <p>
                  Спуск с платформами находится справа от лагеря. S + Space
                  пропускает вниз. Медь → медная кирка → железо → железная кирка
                  → люменит.
                </p>
              </article>
              <article>
                <b>03 / ВООРУЖИТЕСЬ</b>
                <h3>Подготовьтесь к ночи</h3>
                <p>
                  Слитки плавятся в печи из руды и древесины. Наковальня нужна
                  для железа. Наденьте броню через панель. H быстро использует
                  настой.
                </p>
              </article>
              <article>
                <b>04 / ПРОБУДИТЕ</b>
                <h3>Сразитесь со Стражем</h3>
                <p>
                  На наковальне: 8 люменита, 3 железных слитка и 6 сока → Зов
                  корней. Используйте на поверхности. Уходите от залпа, рывка и
                  удара сверху.
                </p>
              </article>
            </div>
            <div className="shelter-note">
              ⌂ Убежище: замкните стены и крышу, поставьте факел и верстак.
              Оставьте люк из платформ. Орин поселится рядом с вами.
            </div>
            <div className="guide-actions">
              <button
                className="primary"
                onClick={() => {
                  bridge.guideOpen = false;
                  refresh();
                }}
              >
                Вернуться в мир <span>→</span>
              </button>
              {s.bossRetry && !boss && (
                <button
                  onClick={() => {
                    bridge.guideOpen = false;
                    scene?.combat.summon();
                    refresh();
                  }}
                >
                  Повторить вызов Стража
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {(s.paused || bridge.helpOpen) &&
        !s.inventoryOpen &&
        !bridge.guideOpen && (
          <div className="modal-backdrop">
            <section className="pause-modal">
              <span className="brand-spark">✦</span>
              <span className="eyebrow">EMBERWILD</span>
              <h1>
                {bridge.helpOpen ? "Ваш полевой справочник" : "Мир подождёт."}
              </h1>
              <p>
                {bridge.helpOpen
                  ? "Всё управление — под рукой."
                  : "Прислушайтесь к тишине между приключениями."}
              </p>
              <div className="help-controls">
                {[
                  ["A / D или ← / →", "Движение"],
                  ["Space / W / ↑", "Прыжок"],
                  ["S + Space", "Спуститься сквозь платформу"],
                  ["1–0 / колесо", "Выбрать ячейку"],
                  ["ЛКМ, удерживать", "Добывать / атаковать / использовать"],
                  ["ПКМ", "Поставить блок / открыть сундук"],
                  ["E", "Рюкзак и ремесло"],
                  ["F", "Поговорить / ближайший сундук"],
                  ["H", "Выпить лечебный настой"],
                  ["Q", "Выбросить выбранную стопку"],
                  ["Esc", "Пауза / закрыть окно"],
                ].map(([key, value]) => (
                  <div key={key}>
                    <kbd>{key}</kbd>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
              <button
                className="primary"
                onClick={() => {
                  s.paused = false;
                  bridge.helpOpen = false;
                  refresh();
                }}
              >
                Продолжить приключение <span>→</span>
              </button>
              <div className="pause-actions">
                <button onClick={save}>Сохранить мир</button>
                <button onClick={() => setNewWorld(true)}>Новый мир</button>
              </div>
              <small>
                Мир сохраняется в этом браузере каждые 20 секунд.
                <br />
                После гибели вы вернётесь в лагерь со всеми вещами.
              </small>
            </section>
          </div>
        )}
      {newWorld && (
        <div className="modal-backdrop confirm-backdrop">
          <section className="pause-modal">
            <h1>Новый мир</h1>
            <p>
              Текущий мир и его сохранение будут заменены. Для одинаковых миров
              используйте одинаковый seed.
            </p>
            <label className="seed-input">
              Seed мира
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                maxLength={80}
                placeholder="Например, FIREFLY-42"
              />
            </label>
            <button
              className="primary"
              onClick={() => {
                const next = new GameState(
                  seed.trim() || `EMBER-${Math.floor(Math.random() * 100000)}`,
                );
                if (next.save()) {
                  s.paused = true;
                  Object.assign(s, next);
                  window.location.reload();
                } else setNotice(next.saveError);
              }}
            >
              Создать и заменить сохранение
            </button>
            <button onClick={() => setNewWorld(false)}>Отмена</button>
          </section>
        </div>
      )}
      <div className="small-screen-note">
        Для игры удобнее клавиатура и мышь · разверните окно шире 900 px.
      </div>
    </main>
  );
}
