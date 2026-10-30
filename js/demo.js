'use strict';
// ---------------------------------------------------------------------------
// Demo film: the first milestone, built with the same API the editor uses
// ---------------------------------------------------------------------------
// Ten seconds: a character walks into a room, picks up a cup, reacts, and the
// camera pushes in. Colour, background, parallax and sound included.

(function (S) {
  const U = S.util;
  const M = S.model;
  const L = S.library;

  function demoProject() {
    const project = M.newProject();
    project.name = 'The Cup';
    const scene = project.scenes[0];
    scene.name = 'Shot 1 · The cup';
    scene.duration = 240;
    const { floorY } = L.applyBackground(scene, 'room');

    const SCALE = 1.25;
    const hero = L.makeCharacter('nadim', -460, floorY);
    Object.assign(hero.props, { scaleX: SCALE, scaleY: SCALE, y: floorY - S.rig.standingHeight(hero.char) * SCALE });
    const desk = L.makeProp('desk', 1450, floorY);
    const cup = L.makeProp('cup', 1262, floorY - 310);
    const sandwich = L.makeProp('sandwich', 1570, floorY - 310);
    scene.objects.push(
      L.makeProp('frame', 800, 250), L.makeProp('lamp', 360, floorY), L.makeProp('rug', 900, floorY + 120),
      L.makeProp('plant', 2000, floorY), desk, sandwich, hero, cup,
      L.makeProp('plant', 90, 1330, { name: 'Foreground plant', depth: 1.6, props: { x: -60, y: 1420, scaleX: 2, scaleY: 2, rotation: 10 } })
    );

    const clips = L.builtinClips();
    const clip = (name) => clips.find((c) => c.name === name);
    const key = (obj, prop, t, v, ease) => M.upsertKey(obj, prop, t, v, ease);
    const pose = (t, world, ease) => { for (const [p, v] of Object.entries(S.rig.relFromWorld(world))) key(hero, p, t, U.round(v, 2), ease); };

    // Put the front wrist on a point in the scene by solving the arm, the way dragging the wrist does.
    const reach = (t, x, y, ease) => {
      const ctx = M.evalCtx(scene, t);
      const local = U.apply(ctx.matrix(hero).inverse(), x, y);
      for (const [p, v] of Object.entries(S.rig.ikProps(ctx.pose(hero), 'Arm', 'R', local.x, local.y, 1))) key(hero, p, t, v, ease);
    };

    // 0-72: walk in from off screen
    const walkEnd = L.applyClip(hero, clip('Walk cycle'), 0, { repeats: 3, travel: true });
    pose(walkEnd + 12, {}, 'inout');

    // 84-100: lean in and reach for the cup
    pose(100, { spine: -80, head: -80 }, 'inout');
    reach(100, 1232, 506, 'inout');
    key(hero, 'handR', 0, 'relaxed'); key(hero, 'handR', 88, 'open'); key(hero, 'handR', 100, 'grip');
    key(hero, 'lookY', 0, 0); key(hero, 'lookY', 84, 0); key(hero, 'lookY', 96, 0.7);

    // 100: the cup leaves the desk with the hand
    M.attachTo(scene, cup, { id: hero.id, bone: 'handR' }, 100);

    // 100-124: lift it to eye level, keeping the cup upright
    for (const name of ['spine', 'head']) key(hero, 'b.' + name, 124, S.rig.relFromWorld({})['b.' + name], 'inout');
    reach(124, 1150, 372, 'inout');
    const handAngle = (t) => M.evalCtx(scene, t).pose(hero).b.handR.a / U.DEG;
    key(cup, 'rotation', 124, U.round(-handAngle(124), 2));

    // 124-166: a long suspicious look
    key(hero, 'expression', 0, 'neutral'); key(hero, 'expression', 130, 'suspicious');
    key(hero, 'lookX', 0, 0); key(hero, 'lookX', 124, 0); key(hero, 'lookX', 132, 0.9);
    key(hero, 'lookY', 124, 0.5); key(hero, 'lookY', 132, 0.35);
    key(hero, 'b.head', 124, 0, 'inout'); key(hero, 'b.head', 136, 14, 'inout');   // bone angles are relative to the parent: tilt towards the cup
    L.applyClip(hero, clip('Blink'), 150);

    // 166-192: the take
    const take = clip('Surprise take');
    const armR = ['b.upperArmR', 'b.lowerArmR', 'b.handR'];
    L.applyClip(hero, { ...take, tracks: Object.fromEntries(Object.entries(take.tracks).filter(([p]) => !armR.includes(p))) }, 166);
    key(hero, 'expression', 171, 'surprised');
    key(hero, 'eyes', 171, 'wide');
    reach(166, 1150, 372, 'snap');
    reach(176, 1176, 318, 'out');
    reach(192, 1160, 384, 'inout');
    for (const t of [166, 176, 192]) key(cup, 'rotation', t, U.round(-handAngle(t), 2));

    // camera: hold the wide shot, then push in on the reaction
    const cam = scene.camera;
    key(cam, 'x', 0, 960); key(cam, 'y', 0, 540); key(cam, 'zoom', 0, 1);
    key(cam, 'x', 118, 960, 'inout'); key(cam, 'y', 118, 540, 'inout'); key(cam, 'zoom', 118, 1, 'inout');
    key(cam, 'x', 200, 1110); key(cam, 'y', 200, 360); key(cam, 'zoom', 200, 2.05);

    // clouds drift past the window
    for (const [name, dx] of [['Cloud A', 230], ['Cloud B', -150]]) {
      const cloud = scene.objects.find((o) => o.name === name);
      key(cloud, 'x', 0, cloud.props.x, 'linear');
      key(cloud, 'x', 240, cloud.props.x + dx, 'linear');
    }

    // sound
    const A = S.audio;
    A.addClip(scene, A.builtin(project, 'roomtone'), 0, 'music', 0.6);
    for (let t = 12; t <= walkEnd; t += 12) A.addClip(scene, A.builtin(project, 'footstep'), t, 'sfx', 0.45 + 0.5 * (t / walkEnd));
    A.addClip(scene, A.builtin(project, 'clink'), 100, 'sfx', 0.8);
    A.addClip(scene, A.builtin(project, 'whoosh'), 122, 'sfx', 0.3);
    A.addClip(scene, A.builtin(project, 'ding'), 170, 'sfx', 0.9);

    scene.markers = [
      { t: 0, label: 'Enter' }, { t: 84, label: 'Reach' }, { t: 100, label: 'Grab' },
      { t: 130, label: 'Hmm…' }, { t: 170, label: 'Take!' }, { t: 200, label: 'Close-up' },
    ];
    return project;
  }

  S.demo = { demoProject };
})(window.Studio);
