const { test, expect } = require('@playwright/test');
const { captureRuntimeErrors, assertNoRuntimeErrors, assertLocalAssetsAndLinks, assertResponsive } = require('./helpers');

test('site navigation, local assets, and internal links stay healthy', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/');
  await expect(page.locator('nav')).toBeVisible();
  await page.locator('nav a[href="fighters.html"]').click();
  await expect(page).toHaveURL(/fighters\.html$/);
  await expect(page.locator('.realm-flip-card')).toHaveCount(8);
  await assertLocalAssetsAndLinks(page);
  await assertNoRuntimeErrors(errors);
});

test('fighter cards reveal one profile at a time and return to the front', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/fighters.html');
  const cards = page.locator('.realm-flip-card');
  await cards.nth(0).click();
  await expect(cards.nth(0)).toHaveClass(/is-flipped/);
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await cards.nth(1).click();
  await expect(cards.nth(0)).not.toHaveClass(/is-flipped/);
  await expect(cards.nth(1)).toHaveClass(/is-flipped/);
  await cards.nth(1).click();
  await expect(cards.nth(1)).not.toHaveClass(/is-flipped/);
  await assertNoRuntimeErrors(errors);
});

test('Grand Prix filter handles unverified editions and restores the full roster', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/fighters.html');
  const cards = page.locator('.realm-flip-card');
  await page.locator('#gpRosterFilter').selectOption('gp-1');
  await expect(cards).toHaveCount(8);
  await expect(page.locator('#gpRosterEmpty')).toBeVisible();
  await expect(cards.first()).toBeHidden();
  await page.locator('#gpRosterFilter').selectOption('all');
  await expect(page.locator('#gpRosterEmpty')).toBeHidden();
  await expect(cards.first()).toBeVisible();
  await assertNoRuntimeErrors(errors);
});

test('fighter page fits a mobile viewport', async ({ page }) => {
  await assertResponsive(page, '/fighters.html');
  await expect(page.locator('.realm-roster-grid')).toBeVisible();
});

test('all qualification stages and the eight-spot rule are readable in both languages', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/realm-nexus.html?lang=es');
  const steps = page.locator('.qualification-list li');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(1)).toContainText('Si hay un todos contra todos');
  await expect(steps.last()).toContainText('Ocho peleadores');
  await expect(page.locator('.qualification-rules')).toContainText('campeón que asciende');
  await page.locator('#langToggle').click();
  await expect(steps.nth(1)).toContainText('In a round robin');
  await expect(steps.last()).toContainText('Eight fighters');
  await expect(page.getByRole('link', { name: 'Apply to compete' })).toHaveAttribute('href', 'competir.html#athlete-interest');
  await assertNoRuntimeErrors(errors);
});

test('shop product lightbox still opens and closes', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/shop.html');
  const lightbox = page.locator('#productLightbox');
  await expect(lightbox).toBeHidden();
  await page.locator('#white-main').click();
  await expect(lightbox).toBeVisible();
  await expect(lightbox.locator('#lightboxImage')).toHaveAttribute('src', /white-set\.png/);
  await lightbox.locator('.lightbox-close').click();
  await expect(lightbox).toBeHidden();
  await assertNoRuntimeErrors(errors);
});

test('Spanish-first realm map, English links and saved preference work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('link', { name: 'Explorar los reinos', exact: true })).toHaveAttribute('href', '#reinos');
  await expect(page.locator('.realm-preview')).toHaveCount(7);
  await expect(page.locator('.realm-preview img')).toHaveCount(7);
  await expect(page.locator('.show-cover .kicker')).toContainText('QUITO');
  await page.locator('#langToggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#burger').click();
  await page.getByRole('navigation').getByRole('link', { name: 'Fighters' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/?lang=es');
  const next = page.getByRole('button', { name: 'Siguiente', exact: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await next.click();
  await expect.poll(() => page.locator('#realm-deck').evaluate(deck => deck.scrollLeft)).toBeGreaterThan(150);
  const oxide = page.locator('.realm-preview').nth(3);
  await oxide.locator('summary').click();
  await expect(oxide).toHaveAttribute('open', '');
  await expect(oxide.locator('.realm-rank')).toHaveText('Experto');
  await expect(page.locator('#realm-deck .realm-video-link')).toHaveCount(7);
  const channel = 'https://www.youtube.com/@raazborg2020/featured';
  const video = 'https://www.youtube.com/watch?v=QzLvQCTzAXY&list=PLbhNwfZ6E0sGrxPPlNdXm1gRO0bnbgAMg';
  await expect(oxide.getByRole('link', { name: 'Explorar reino' })).toHaveAttribute('href', video);
  const otherCards = page.locator('.realm-preview:not(#realm-oxide)');
  for (const card of await otherCards.all()) {
    await expect(card.locator('.realm-video-link')).toHaveAttribute('href', channel);
  }
  await page.goto('/clashes.html#gp-oxide-overdrive');
  await expect(page.locator('#gpArchiveTitle')).toHaveText('Oxide Overdrive');
  await expect(page.locator('#gpArchiveOverlay')).toBeVisible();
});

test('athletes sign in, apply, open their private realm, and see grey empty fight stats', async ({page}) => {
  const id = '00000000-0000-4000-8000-000000000001';
  const user = {id, email:'test@example.invalid', email_confirmed_at:new Date().toISOString(), aud:'authenticated', role:'authenticated', app_metadata:{}, user_metadata:{}, identities:[]};
  const jwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = [jwtPart({alg:'HS256'}),jwtPart({sub:id,exp:Math.floor(Date.now()/1000)+3600,session_id:'00000000-0000-4000-8000-000000000009'}),'c2ln'].join('.');
  const rows = [];
  let signinAlertQueued = false;
  await page.route('https://*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data;
    if(path.endsWith('/token')) data = {user,access_token:token,refresh_token:'test-session',token_type:'bearer',expires_in:3600};
    else if(path.endsWith('/user')) data = user;
    else if(path.endsWith('/rb_my_profile_v2')) data = [];
    else if(path.endsWith('/rb_my_applications')) data = rows;
    else if(path.endsWith('/rb_queue_sign_in_alert')) { signinAlertQueued = true; data = true; }
    else if(path.endsWith('/rb_my_fighter_portal')) data = {
      email:user.email,username:'Prueba',name:'Test',first_name:'Prueba',last_name:'Atleta',
      alias:'Test',city:'Quito',belt:'blue',realm:'Zaphire Trials',
      gym:'Test Academy',country:'Ecuador',prior_record:{competed:8,won:5,lost:2,drawn:1},
      avatar_path:null,
      application:rows.length ? {id,interest:'gp',status:'submitted',realm:'Zaphire Trials',submitted_at:new Date().toISOString()} : null,
      messages:rows.length ? [{kind:'welcome',created_at:new Date().toISOString()}] : [],
      stats:{total:0,wins:0,losses:0,draws:0},recent_fights:[]
    };
    else if(path.endsWith('/rb_register_roster')) {
      const body=route.request().postDataJSON();
      expect(body.p_belt).toBe('blue');
      expect(body.p_interest).toBe('gp');
      expect(body.p_contact_consent).toBe(true);
      expect(body.p_profile.first_name).toBe('Prueba');
      expect(body.p_profile.last_name).toBe('Atleta');
      expect(body.p_prior).toEqual({competed:8,won:5,lost:2,drawn:1});
      rows.push({id,interest:'gp',suggested_realm:'Zaphire Trials',status:'submitted',submitted_at:new Date().toISOString()});
      data=id;
    }
    else if(path.endsWith('/athlete-notify')) data={configured:false,delivered:0};
    else if(path.endsWith('/logout')) data={};
    else throw new Error('Unexpected auth route '+path);
    await route.fulfill({json:data});
  });
  await page.goto('/competir.html?belt=blue&interest=gp&lang=es');
  await page.locator('#auth-signin').click();
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill('test-password');
  await page.locator('#primary-auth').click();
  await expect(page.locator('#application')).toBeVisible();
  // Sign-in alert delivery is checked by the database role/idempotency suite;
  // the mocked browser session focuses on the athlete journey.
  await page.locator('#first_name').fill('Prueba');
  await page.locator('#last_name').fill('Atleta');
  await page.locator('#alias').fill('Test');
  await page.locator('#city').fill('Quito');
  await page.locator('#prior_competed').fill('8');
  await page.locator('#prior_won').fill('5');
  await page.locator('#prior_lost').fill('2');
  await page.locator('#prior_drawn').fill('1');
  await page.locator('#application input[name="contact"]').check();
  await page.locator('#submit-application').click();
  await expect(page).toHaveURL(/fighter-dashboard\.html\?lang=es&submitted=1$/);
  await expect(page.locator('#portal-content')).toBeVisible();
  await expect(page.locator('#fighterDisplayName')).toHaveText('Prueba');
  await expect(page.locator('#application-status')).toHaveText('Registro pendiente de revisión');
  await expect(page.locator('#welcome-copy')).toContainText('¡Bienvenido al universo Börg');
  await expect(page.locator('#winPercentage')).toHaveText('—');
  await expect(page.locator('#fightWins')).toHaveText('—');
  await expect(page.locator('#priorCompeted')).toHaveText('8');
  await expect(page.locator('#priorWon')).toHaveText('5');
  await expect(page.locator('#priorLost')).toHaveText('2');
  await expect(page.locator('#priorDrawn')).toHaveText('1');
  await expect(page.locator('#fighterFirstName')).toHaveText('Prueba');
  await expect(page.locator('#fighterLastName')).toHaveText('Atleta');
  await expect(page.locator('#fightLosses')).toHaveText('—');
  await expect(page.locator('#fightDonut')).toHaveCSS('background-image',/conic-gradient/);
  await page.locator('#langToggle').click();
  await expect(page.locator('#application-status')).toHaveText('Roster registration pending review');
  await expect(page.locator('#welcome-copy')).toContainText('Welcome to the Börg Realm');
  await page.reload();
  await expect(page.locator('#portal-content')).toBeVisible();
  await page.locator('#portal-logout').click();
  await expect(page).toHaveURL(/competir\.html\?lang=en$/);
  await expect(page.locator('#application')).toBeHidden();
});

test('fighter record donut shows real registered win/loss/draw proportions', async ({page}) => {
  const id='00000000-0000-4000-8000-000000000050';
  const user={id,email:'fighter@example.invalid',aud:'authenticated',role:'authenticated',identities:[]};
  const jwtPart=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=[jwtPart({alg:'HS256'}),jwtPart({sub:id,exp:Math.floor(Date.now()/1000)+3600}),'c2ln'].join('.');
  await page.route('https://*.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data;
    if(path.endsWith('/user'))data=user;
    else if(path.endsWith('/rb_my_fighter_portal'))data={
      email:user.email,username:'iron_grappler',name:'Iron Grappler',
      realm:'Oxide Overdrive',belt:'brown',country:'Ecuador',
      application:{status:'in_review',id:'00000000-0000-4000-8000-000000000051',interest:'gp',realm:'Oxide Overdrive'},
      messages:[{kind:'welcome',created_at:new Date().toISOString()}],
      stats:{wins:3,losses:1,draws:1,total:5},
      recent_fights:[{opponent:'Sample Opponent',result:'win',method:'Decision',date:'2026-11-01'}]
    };
    else if(path.endsWith('/athlete-notify'))data={configured:false,delivered:0};
    else throw Error('Unexpected '+path);
    await route.fulfill({json:data});
  });
  await page.addInitScript(({user,token})=>{
    // A valid-looking persisted client session, used only by mocked browser tests.
    const key='raaz-athlete-session';
    localStorage.setItem(key,JSON.stringify({access_token:token,token_type:'bearer',refresh_token:'fake',
      expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));
  },{user,token});
  await page.goto('/fighter-dashboard.html?lang=en');
  await expect(page.locator('#portal-content')).toBeVisible();
  await expect(page.locator('#fighterDisplayName')).toHaveText('iron_grappler');
  await expect(page.locator('#application-status')).toHaveText('Registration under review');
  await expect(page.locator('#winPercentage')).toHaveText('60%');
  await expect(page.locator('#totalFights')).toHaveText('5');
  await expect(page.locator('#fightWins')).toHaveText('3');
  await expect(page.locator('#fightLosses')).toHaveText('1');
  await expect(page.locator('#fightDraws')).toHaveText('1');
  await expect(page.locator('#fightList')).toContainText('Sample Opponent');
  const gradient=await page.locator('#fightDonut').evaluate(el=>getComputedStyle(el).backgroundImage);
  expect(gradient).toContain('conic-gradient');
  expect(gradient).not.toContain('110, 106, 115');
  await assertResponsive(page,'/fighter-dashboard.html?lang=en');
});

test('realm cards retain the whole poster and open one accessible reverse at a time', async ({ page }) => {
  await page.goto('/?lang=en#reinos');
  const cards = page.locator('.realm-preview');
  const first = cards.first();
  const second = cards.nth(1);
  await expect(first.locator('img')).toHaveCSS('object-fit', 'contain');
  await expect(first.locator('.realm-rank')).toBeHidden();
  const artwork = await first.locator('img').boundingBox();
  expect(artwork.height).toBeGreaterThan(artwork.width);
  const front = await first.boundingBox();
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(first.locator('.realm-rank')).toBeVisible();
  await expect(first.locator('.realm-rank')).toHaveText('Beginner');
  expect((await first.boundingBox()).height).toBeCloseTo(front.height, 0);
  await first.locator('.realm-reverse h3').click();
  await expect(first).not.toHaveAttribute('open', '');
  await expect(first.locator('summary')).toBeFocused();
  await first.locator('summary').press('Enter');
  await second.locator('summary').press('Space');
  await expect(first).not.toHaveAttribute('open', '');
  await expect(second).toHaveAttribute('open', '');
  await expect(second.locator('.realm-rank')).toHaveText('Intermediate');
  const summary = second.locator('.realm-reverse p [data-en]');
  await expect(summary).toBeVisible();
  await expect(summary).toHaveAttribute('data-en', /\S/);
  await expect(summary).toHaveText(await summary.getAttribute('data-en'));
  await second.locator('summary').press('Enter');
  await expect(second).not.toHaveAttribute('open', '');
});


test.describe('mobile realm navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

  test('tapping the back closes the card and destination links work in both languages', async ({ page }) => {
    await page.goto('/?lang=es#reinos');
    const card = page.locator('.realm-preview').first();
    await card.locator('summary').tap();
    const channelLink = card.getByRole('link', { name: 'Explorar reino' });
    await page.context().route('https://www.youtube.com/**', route => route.fulfill({ contentType: 'text/html', body: '' }));
    const popupPromise = page.waitForEvent('popup');
    await channelLink.tap();
    const popup = await popupPromise;
    await expect(popup).toHaveURL('https://www.youtube.com/@raazborg2020/featured');
    await popup.close();
    await expect(card).toHaveAttribute('open', '');
    await card.locator('.realm-reverse p').tap();
    await expect(card).not.toHaveAttribute('open', '');
    const routes = page.locator('.realm-tools');
    await expect(page.getByRole('link', { name: 'Ver todos los peleadores' })).toHaveAttribute('href', 'fighters.html');
    await expect(routes.getByRole('link', { name: 'Cómo clasificar al Grand Prix' })).toHaveAttribute('href', 'realm-nexus.html');
    await page.locator('#langToggle').tap();
    await routes.getByRole('link', { name: 'How to qualify for the Grand Prix' }).tap();
    await expect(page).toHaveURL(/realm-nexus\.html$/);
  });
});

test('Clashes points to one bilingual set of realm cards and old realm bookmarks open the matching card', async ({ page }) => {
  await page.goto('/clashes.html?lang=es');
  await expect(page.locator('.clashes-realm-card')).toHaveCount(0);
  await page.getByRole('link', { name: 'Encuentra tu reino según tu experiencia' }).click();
  await expect(page).toHaveURL(/index\.html#reinos$/);
  const ranks = page.locator('#realm-deck .realm-rank');
  await expect(ranks).toHaveText(['Principiante', 'Intermedio', 'Avanzado', 'Experto', 'Élite', 'Maestro', 'Gran maestro']);
  await page.locator('#langToggle').click();
  await expect(ranks).toHaveText(['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Elite', 'Master', 'Grandmaster']);
  await page.goto('/clashes.html?lang=en#realm-oxide');
  await expect(page).toHaveURL(/index\.html\?lang=en#realm-oxide$/);
  await expect(page.locator('#realm-oxide')).toHaveAttribute('open', '');
  await expect(page.locator('#realm-oxide').getByRole('link', { name: 'Explore Realm' })).toBeVisible();
  const oxideSummary = page.locator('#realm-oxide .realm-reverse p [data-en]');
  await expect(oxideSummary).toBeVisible();
  await expect(oxideSummary).toHaveAttribute('data-en', /\S/);
  await expect(oxideSummary).toHaveText(await oxideSummary.getAttribute('data-en'));
});

test('each enlist link prefills the belt and realm shown on that card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const realms = ['white-carbon', 'zaphire', 'violet', 'oxide', 'praetoreans', 'nexus', 'eclipse'];
  for (const id of realms) {
    await page.goto('/?lang=en#realm-' + id);
    const card = page.locator('#realm-' + id);
    const realm = await card.getByRole('heading').innerText();
    const belt = await card.locator('.realm-strip [data-en]').innerText();
    await card.getByRole('link', { name: 'Apply to compete', exact: true }).click();
    await expect(page.locator('#belt option:checked')).toHaveText(belt, { ignoreCase: true });
    await expect(page.locator('#belt-realm')).toHaveText(realm, { ignoreCase: true });
    await expect(page.getByLabel('Current belt')).toBeInViewport();
  }
  await page.getByLabel('Current belt').selectOption('brown');
  await expect(page.locator('#belt-realm')).toHaveText('Oxide Overdrive');
  await page.reload();
  await expect(page.locator('#belt')).toHaveValue('brown');
  await page.goto('/competir.html?belt=unknown');
  await expect(page.locator('#belt')).toHaveValue('');
  await expect(page.locator('#belt-assigned')).toBeHidden();
});

test('a visitor can find a belt on mobile and carry it into an inquiry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?lang=es#reinos');
  const finder = page.locator('#belt-finder');
  await finder.getByLabel('Tu cinturón').selectOption({ label: 'Cinturón azul' });
  await page.locator('#langToggle').click();
  await expect(finder.locator('option:checked')).toHaveText('Blue belt');
  await finder.getByRole('button', { name: 'Find my realm' }).click();
  const card = page.locator('#realm-zaphire');
  await expect(card.locator('summary')).toBeFocused();
  await card.getByRole('link', { name: 'Apply to compete' }).click();
  await expect(page.locator('#belt')).toHaveValue('blue');
  await expect(page.locator('#belt-realm')).toHaveText('Zaphire Trials');
  await page.goto('/?lang=es#reinos');
  await finder.getByLabel('Tu cinturón').selectOption('review');
  await finder.getByRole('button', { name: 'Ver mi reino' }).click();
  await expect(page.locator('#belt')).toHaveValue('');
  await page.goto('/labs.html?lang=es');
  await page.getByRole('link', { name: 'Consultar por entrenamientos' }).click();
  await expect(page.locator('#interest')).toHaveValue('lab');
});

test('spectators and streetwear shoppers can follow their own paths on mobile', async ({ page }) => {
  await assertResponsive(page, '/?lang=es');
  const trailer = page.locator('.show-film video');
  await expect(trailer).toHaveAttribute('controls', '');
  await expect(trailer).not.toHaveAttribute('autoplay', '');
  const source = await trailer.locator('source').getAttribute('src');
  expect((await page.request.head('/' + source)).ok()).toBeTruthy();
  await page.getByRole('link', { name: 'Quiero ir al show' }).click();
  await expect(page).toHaveURL(/clashes\.html#publico$/);
  await expect(page.getByRole('link', { name: 'Consultar por el show en Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/raazborg/');
  await page.goto('/?lang=en');
  await page.getByRole('link', { name: 'Shop streetwear' }).click();
  await expect(page.locator('#ropa-urbana h2')).toBeInViewport();
  await expect(page.locator('#ropa-urbana .p-card')).toHaveCount(2);
  await page.goto('/?lang=en');
  await page.getByRole('link', { name: 'Dragon Kimono', exact: true }).click();
  await expect(page.locator('#kimono-dragon')).toBeInViewport();
  await expect(page.locator('#kimono-dragon .order-product')).toHaveCount(2);
  await page.goto('/?lang=es');
  await page.getByRole('link', { name: 'Conjunto urbano', exact: true }).click();
  await expect(page.locator('#conjunto-urbano')).toBeInViewport();
  await page.locator('#conjunto-urbano button[data-size="L"]').click();
  await expect(page.locator('#conjunto-urbano button[data-size="L"]')).toHaveClass(/selected/);
});

test('Lab videos open in a larger player and preserve timestamps and playlists', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ body: 'Video player stub' }));
  await page.goto('/labs.html?lang=en');
  await expect(page.locator('.featured-videos .lab-play')).toHaveCount(4);
  await page.getByRole('link', { name: /Blue Oblivion BJJ 2021/ }).click();
  await expect(page).toHaveURL(/labs\.html\?lang=en$/);
  await expect(page.locator('.lab-player iframe')).toHaveAttribute('src', /wOxh1xijsrM\?start=28&autoplay=1$/);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const card = page.locator('.lab-play[href*="wOxh1xijsrM"]');
  const frame = dialog.locator('iframe');
  expect((await frame.boundingBox()).width).toBeGreaterThan((await card.boundingBox()).width);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
  await expect(page.locator('.lab-player iframe')).not.toHaveAttribute('src', /youtube/);
  await page.locator('#transmisiones .lab-play[href*="list="]').click();
  await expect(page.locator('.lab-player iframe')).toHaveCount(1);
  await expect(page.locator('.lab-player iframe')).toHaveAttribute('src', /list=PLbhNwfZ6E0sGrxPPlNdXm1gRO0bnbgAMg/);
  await page.getByRole('button', { name: 'Close player' }).click();
  await expect(page.locator('#transmisiones .lab-play[href*="list="]')).toBeFocused();
});

test('Visual World opens the jaguar hoodie and browses images without leaving the page', async ({ page }) => {
  await page.goto('/labs.html?lang=en#mundo-visual');
  const hoodie = page.getByRole('button', { name: /jaguar hoodie/i });
  await hoodie.click();
  const gallery = page.getByRole('dialog', { name: 'Visual World gallery' });
  await expect(gallery).toBeVisible();
  await expect(gallery.locator('img')).toHaveAttribute('src', /instagram-jaguar-hoodie\.webp$/);
  await gallery.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(gallery.locator('img')).toHaveAttribute('src', /instagram-white-carbon-poster\.webp$/);
  await page.keyboard.press('ArrowLeft');
  await expect(gallery.locator('img')).toHaveAttribute('src', /instagram-jaguar-hoodie\.webp$/);
  await page.keyboard.press('Escape');
  await expect(gallery).not.toBeVisible();
  await expect(hoodie).toBeFocused();
  await expect(page).toHaveURL(/labs\.html\?lang=en#mundo-visual$/);
});

test('the Lab directory jumps to a compact mobile list and every card opens the player', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ body:'Player' }));
  await assertResponsive(page, '/labs.html?lang=es');
  const directory = page.getByRole('navigation', { name:'Secciones del Lab' });
  await directory.getByRole('link', { name:'Encuentros del Lab' }).click();
  await expect(page.locator('#encounters-title')).toBeInViewport();
  const first = page.locator('#encuentros .lab-play').first();
  expect((await first.locator('img').boundingBox()).width).toBeLessThan(150);
  await first.getByRole('heading').click();
  await expect(page.locator('.lab-player')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
  await page.locator('#langToggle').click();
  await page.getByRole('navigation', { name:'Lab sections' }).getByRole('link', { name:'Transmissions' }).click();
  await page.locator('#transmisiones .lab-play').last().getByRole('heading').click();
  await expect(page.locator('.lab-player iframe')).toHaveAttribute('src', /list=/);
});

test('catalog previews defer originals until opened and the gallery returns focus', async ({ page }) => {
  const originals = [];
  await page.route(/\/assets\/(?:dragon|dragron|white|orange|tracksuit)-[^/]+\.png$/, route => {
    originals.push(route.request().url());
    return route.continue();
  });
  await page.goto('/shop.html');
  const thumb = page.locator('#kimono-dragon .thumb').nth(1);
  await thumb.scrollIntoViewIfNeeded();
  await expect(thumb.locator('img')).toHaveAttribute('src', /-thumb\.webp$/);
  expect(originals).toHaveLength(0);
  await thumb.click();
  const gallery = page.getByRole('dialog', { name:'Galería de productos' });
  await expect(gallery.locator('img')).toHaveAttribute('src', /dragron-kimono-back\.png$/);
  await page.keyboard.press('ArrowRight');
  await expect(gallery.locator('img')).toHaveAttribute('src', /dragon-kimono-front\.png$/);
  await page.keyboard.press('Escape');
  await expect(thumb).toBeFocused();
});

test('the application restores belt and GP or Lab interest together', async ({ page }) => {
  await page.goto('/competir.html?lang=en&interest=both&belt=brown');
  await expect(page.locator('#interest')).toHaveValue('both');
  await page.locator('#interest').selectOption('gp');
  await page.reload();
  await expect(page.locator('#interest')).toHaveValue('gp');
  await expect(page.locator('#belt-realm')).toHaveText('Oxide Overdrive');
});

test('new athletes see clear account creation and existing members can switch to sign in', async ({ page }) => {
  await page.goto('/competir.html?lang=es&belt=blue&interest=gp');
  await expect(page.locator('#auth-create')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#primary-auth')).toHaveText('Crear cuenta');
  await expect(page.locator('#auth-explainer')).toContainText('Confírmalo');
  await expect(page.locator('#account')).toContainText('entrarás directamente a tu portal');
  await expect(page.locator('#recover')).toBeHidden();
  await page.locator('#auth-signin').click();
  await expect(page.locator('#primary-auth')).toHaveText('Iniciar sesión');
  await expect(page.locator('#recover')).toBeVisible();
  await expect(page.locator('#belt')).toHaveValue('blue');
  await page.locator('#langToggle').click();
  await expect(page.locator('#auth-create')).toHaveText('Create account');
  await expect(page.locator('#primary-auth')).toHaveText('Sign in');
  await expect(page.locator('#interest')).toHaveValue('gp');
});

test('catalog prices and selected sizes are visible before inquiry', async ({ page }) => {
  await page.goto('/shop.html?lang=en');
  const cards = page.locator('.p-card');
  await expect(cards).toHaveCount(4);
  const prices = ['$30', '$60', '$50', '$60'];
  for (let i=0;i<4;i++) await expect(cards.nth(i).locator('.p-price')).toContainText(prices[i]);
  const sizes = page.locator('#conjunto-urbano .size-row');
  const first = sizes.locator('button[data-size="S"]');
  const second = sizes.locator('button[data-size="L"]');
  await expect(first).toHaveAttribute('aria-pressed','true');
  await second.click();
  await expect(second).toHaveAttribute('aria-pressed','true');
  await expect(first).toHaveAttribute('aria-pressed','false');
  const selectedBackground = await second.evaluate(el=>getComputedStyle(el).backgroundColor);
  const unselectedBackground = await first.evaluate(el=>getComputedStyle(el).backgroundColor);
  expect(selectedBackground).not.toEqual(unselectedBackground);
  await expect(page.locator('#conjunto-urbano .size-selection-status')).toHaveText('Selected size: L');
});

test('reviewer dashboard denies unauthorised users and only exposes a verified queue', async ({page}) => {
  const id='00000000-0000-4000-8000-000000000099';
  const user={id,email:'reviewer@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},identities:[]};
  const jwtPart=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=[jwtPart({alg:'HS256'}),jwtPart({sub:id,exp:Math.floor(Date.now()/1000)+3600}),'c2ln'].join('.');
  const record={id:'00000000-0000-4000-8000-000000000100',alias:'Atleta de prueba',city:'Quito',belt:'blue',suggested_realm:'Zaphire Trials',contact_email:'athlete@example.invalid',status:'submitted',interest:'gp',submitted_at:new Date().toISOString()};
  const rows=[record];
  await page.route('https://*.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data;
    if(path.endsWith('/token')) data={user,access_token:token,refresh_token:'staff-session',token_type:'bearer',expires_in:3600};
    else if(path.endsWith('/user')) data=user;
    else if(path.endsWith('/rb_review_queue_v2')) data=rows;
    else if(path.endsWith('/rb_review_application')) {
      const body=route.request().postDataJSON();
      expect(body.p_expected_status).toBe(record.status);
      record.status=body.p_new_status;data=record.status;
    } else if(path.endsWith('/logout')) data={};
    else throw Error('Unexpected route '+path);
    await route.fulfill({json:data});
  });
  await page.goto('/equipo.html?lang=es');
  await expect(page.locator('#team-queue')).toBeHidden();
  await page.locator('#team-email').fill(user.email);
  await page.locator('#team-password').fill('test-password');
  await page.locator('#team-signin').click();
  await expect(page.locator('#team-queue')).toBeVisible();
  await expect(page.locator('#team-results')).toContainText('Atleta de prueba');
  await expect(page.locator('#team-results')).toContainText('athlete@example.invalid');
  await page.locator('#team-results button[data-next="in_review"]').click();
  await expect(page.locator('#team-results')).toContainText('En revisión');
  await page.locator('#team-signout').click();
  await expect(page.locator('#team-queue')).toBeHidden();
  await expect(page.locator('#team-login')).toBeVisible();
});

test('expanded athlete profile keeps typed values and shows selected measurements', async ({ page }) => {
  await page.goto('/competir.html?lang=en&belt=purple&interest=gp');
  await page.locator('#auth-signin').click();
  await expect(page.locator('#first_name')).toBeHidden();
  await expect(page.locator('#date_of_birth')).toBeHidden();
  await expect(page.locator('#belt')).toHaveValue('purple');
  await expect(page.locator('#interest')).toHaveValue('gp');
  await expect(page.locator('#country')).toHaveAttribute('required','');
  await expect(page.locator('#weight_unit')).toHaveValue('kg');
  await expect(page.locator('#height_unit')).toHaveValue('cm');
});


test('roster members clicking Compete go to their portal without repeating fighter details', async ({page}) => {
  const id='00000000-0000-4000-8000-000000000091';
  const user={id,email:'roster@example.invalid',aud:'authenticated',role:'authenticated',identities:[]};
  const jwtPart=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=[jwtPart({alg:'HS256'}),jwtPart({sub:id,exp:Math.floor(Date.now()/1000)+3600}),'c2ln'].join('.');
  const rows=[{id:'00000000-0000-4000-8000-000000000092',status:'submitted',interest:'gp',belt:'blue',submitted_at:new Date().toISOString()}];
  await page.route('https://*.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data;
    if(path.endsWith('/user'))data=user;
    else if(path.endsWith('/rb_my_profile_v2'))data=[{alias:'Returning',belt:'blue',city:'Quito'}];
    else if(path.endsWith('/rb_my_applications'))data=rows;
    else if(path.endsWith('/rb_queue_sign_in_alert'))data=true;
    else if(path.endsWith('/rb_my_fighter_portal'))data={
      email:user.email,username:'returning',name:'Returning',belt:'blue',
      application:{status:'submitted',id:rows[0].id,interest:'gp',realm:'Zaphire Trials'},
      messages:[{kind:'welcome',created_at:new Date().toISOString()}],
      stats:{wins:0,losses:0,draws:0,total:0},prior_record:null,recent_fights:[]
    };
    else if(path.endsWith('/athlete-notify'))data={configured:false,delivered:0};
    else throw Error('Unexpected route '+path);
    await route.fulfill({json:data});
  });
  await page.addInitScript(({user,token})=>{
    localStorage.setItem('raaz-athlete-session',JSON.stringify({
      access_token:token,token_type:'bearer',refresh_token:'fake',
      expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));
  },{user,token});
  await page.goto('/competir.html?lang=es');
  await expect(page).toHaveURL(/fighter-dashboard\.html\?lang=es$/);
  await expect(page.locator('#portal-content')).toBeVisible();
  await page.goto('/competir.html?lang=en');
  await expect(page).toHaveURL(/fighter-dashboard\.html\?lang=en$/);
  await expect(page.locator('#portal-content')).toBeVisible();
  await expect(page.locator('#priorCompeted')).toHaveText('—');
});

test('roster screen never flashes while checking an authenticated returning fighter', async ({page}) => {
  const id='00000000-0000-4000-8000-000000000081';
  const user={id,email:'existing@example.invalid',aud:'authenticated',role:'authenticated',identities:[]};
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=[encode({alg:'HS256'}),encode({sub:id,exp:Math.floor(Date.now()/1000)+3600}),'sig'].join('.');
  let releaseLookup;
  const lookupGate=new Promise(resolve=>{releaseLookup=resolve;});
  await page.route('https://*.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/user'))return route.fulfill({json:user});
    if(path.endsWith('/rb_my_applications')) {
      await lookupGate;
      return route.fulfill({json:[{id:'00000000-0000-4000-8000-000000000082',
        status:'submitted',interest:'gp',belt:'blue',submitted_at:new Date().toISOString()}]});
    }
    if(path.endsWith('/rb_my_profile_v2'))return route.fulfill({json:[]});
    if(path.endsWith('/rb_queue_sign_in_alert'))return route.fulfill({json:true});
    if(path.endsWith('/rb_my_fighter_portal'))return route.fulfill({json:{
      email:user.email,username:'existing',name:'Existing Fighter',belt:'blue',
      application:{id:'00000000-0000-4000-8000-000000000082',status:'submitted',
        interest:'gp',realm:'Zaphire Trials'},
      stats:{wins:0,losses:0,draws:0,total:0},messages:[],recent_fights:[]
    }});
    if(path.endsWith('/athlete-notify'))return route.fulfill({json:{configured:false,delivered:0}});
    throw Error('Unexpected '+path);
  });
  await page.addInitScript(({user,token})=>{
    localStorage.setItem('raaz-athlete-session',JSON.stringify({
      access_token:token,token_type:'bearer',refresh_token:'fake',
      expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user
    }));
  },{user,token});
  try {
    await page.goto('/competir.html?lang=en');
    await expect(page.locator('#roster-gate')).toBeVisible();
    await expect(page.locator('#roster-gate-message')).toContainText('Checking');
    await expect(page.getByRole('heading',{name:'Join the fighter roster'})).toBeHidden();
    await expect(page.locator('#account')).toBeHidden();
    await expect(page.locator('#application')).toBeHidden();
    await page.waitForTimeout(850);
    await expect(page.getByRole('heading',{name:'Join the fighter roster'})).toBeHidden();
    releaseLookup();
    await expect(page).toHaveURL(/fighter-dashboard\.html\?lang=en$/);
    await expect(page.locator('#portal-content')).toBeVisible();
  } finally { releaseLookup(); }
});

test('visitors without a session see the roster form after authentication check', async ({page})=>{
  await page.goto('/competir.html?lang=en');
  await expect(page.locator('#roster-gate')).toBeHidden();
  await expect(page.getByRole('heading',{name:'Join the fighter roster'})).toBeVisible();
  await expect(page.locator('#account')).toBeVisible();
});

test('private portal updates self-reported totals without changing fight-by-fight donut', async ({page}) => {
  const id='00000000-0000-4000-8000-000000000093';
  const user={id,email:'prior@example.invalid',aud:'authenticated',role:'authenticated',identities:[]};
  const jwtPart=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=[jwtPart({alg:'HS256'}),jwtPart({sub:id,exp:Math.floor(Date.now()/1000)+3600}),'c2ln'].join('.');
  let savedPrior=null;
  await page.route('https://*.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data;
    if(path.endsWith('/user'))data=user;
    else if(path.endsWith('/rb_my_fighter_portal'))data={
      email:user.email,username:'prior',name:'Prior Athlete',belt:'white',prior_record:savedPrior,
      application:{id:'00000000-0000-4000-8000-000000000094',status:'submitted',interest:'gp'},
      messages:[],stats:{total:0,wins:0,losses:0,draws:0},recent_fights:[]
    };
    else if(path.endsWith('/rb_update_roster_prior')) {savedPrior=route.request().postDataJSON().p_prior;data=savedPrior;}
    else if(path.endsWith('/athlete-notify'))data={configured:false,delivered:0};
    else throw Error('Unexpected route '+path);
    await route.fulfill({json:data});
  });
  await page.addInitScript(({user,token})=>{
    localStorage.setItem('raaz-athlete-session',JSON.stringify({
      access_token:token,token_type:'bearer',refresh_token:'fake',
      expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));
  },{user,token});
  await page.goto('/fighter-dashboard.html?lang=en');
  await expect(page.locator('#portal-content')).toBeVisible();
  await page.locator('#portal-prior-edit-toggle').click();
  await page.locator('#edit-prior-competed').fill('10');
  await page.locator('#edit-prior-won').fill('6');
  await page.locator('#edit-prior-lost').fill('3');
  await page.locator('#edit-prior-drawn').fill('1');
  await page.locator('#portal-prior-save').click();
  await expect(page.locator('#priorCompeted')).toHaveText('10');
  await expect(page.locator('#priorWon')).toHaveText('6');
  await expect(page.locator('#priorLost')).toHaveText('3');
  await expect(page.locator('#priorDrawn')).toHaveText('1');
  await expect(page.locator('#winPercentage')).toHaveText('—');
  await expect(page.locator('#fightWins')).toHaveText('—');
  await page.locator('#portal-prior-edit-toggle').click();
  await page.locator('#edit-prior-competed').fill('1');
  await page.locator('#edit-prior-won').fill('2');
  await page.locator('#edit-prior-lost').fill('0');
  await page.locator('#edit-prior-drawn').fill('0');
  await page.locator('#portal-prior-save').click();
  await expect(page.locator('#portal-prior-feedback')).toContainText('Results cannot exceed');
  await expect(page.locator('#priorCompeted')).toHaveText('10');
});


test('private fighter photo uploads to the owner folder and can be removed from the portal', async ({page}) => {
  const id='00000000-0000-4000-8000-000000000095';
  const user={id,email:'photo@example.invalid',aud:'authenticated',role:'authenticated',identities:[]};
  const jwtPart=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=[jwtPart({alg:'HS256'}),jwtPart({sub:id,exp:Math.floor(Date.now()/1000)+3600}),'c2ln'].join('.');
  let stored=null,uploaded=null,saveCount=0;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+ZykvAAAAAElFTkSuQmCC','base64');
  await page.route('https://*.supabase.co/**',async route=>{
    const u=new URL(route.request().url()),path=u.pathname,method=route.request().method();
    let data;
    if(path.endsWith('/user')) data=user;
    else if(path.endsWith('/rb_my_fighter_portal')) data={
      email:user.email,username:'photo_athlete',name:'Photo Athlete',belt:'blue',
      avatar_path:stored,prior_record:null,
      application:{id:'00000000-0000-4000-8000-000000000096',status:'submitted',interest:'gp'},
      messages:[],stats:{total:0,wins:0,losses:0,draws:0},recent_fights:[]
    };
    else if(path.endsWith('/rb_set_roster_avatar')) {
      stored=route.request().postDataJSON().p_path;saveCount++;data=stored;
    }
    else if(path.startsWith('/storage/v1/object/roster-avatars/') && method==='POST') {
      uploaded=decodeURIComponent(path.split('/').slice(5).join('/'));
      expect(uploaded).toMatch(new RegExp('^'+id.replace(/-/g,'\\-')+'/[a-f0-9-]+\\.png$'));
      data={Key:'roster-avatars/'+uploaded};
    }
    else if(path.startsWith('/storage/v1/object/sign/roster-avatars/')) {
      if(method==='POST')data={signedURL:'/object/sign/roster-avatars/'+stored+'?token=fake'};
      else {await route.fulfill({body:png,contentType:'image/png'});return;}
    }
    else if(path==='/storage/v1/object/roster-avatars' && method==='DELETE')data={};
    else if(path.endsWith('/athlete-notify'))data={configured:false,delivered:0};
    else throw Error('Unexpected route '+method+' '+path);
    await route.fulfill({json:data});
  });
  await page.addInitScript(({user,token})=>{
    localStorage.setItem('raaz-athlete-session',JSON.stringify({
      access_token:token,token_type:'bearer',refresh_token:'fake',
      expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user}));
  },{user,token});
  await page.goto('/fighter-dashboard.html?lang=en');
  await expect(page.locator('#portal-content')).toBeVisible();
  await page.locator('#portal-photo-input').setInputFiles({
    name:'fighter.png',mimeType:'image/png',buffer:png
  });
  await page.locator('#portal-photo-save').click();
  await expect.poll(()=>saveCount).toBe(1);
  expect(uploaded).toContain(id+'/');
  await expect(page.locator('#portal-photo-remove')).toBeVisible();
  await page.locator('#portal-photo-remove').click();
  await expect.poll(()=>saveCount).toBe(2);
  expect(stored).toBeNull();
  await expect(page.locator('#portal-photo-remove')).toBeHidden();
  await expect(page.locator('#fighter-avatar')).toBeVisible();
});
