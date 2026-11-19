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

test('athletes sign in, submit, return to their status and sign out in both languages', async ({page}) => {
  const id = '00000000-0000-4000-8000-000000000001';
  const user = {id, email:'test@example.invalid', aud:'authenticated', role:'authenticated', app_metadata:{},user_metadata:{}, identities:[]};
  const jwtPart = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = [jwtPart({alg:'HS256'}),jwtPart({sub:id,exp:Math.floor(Date.now()/1000)+3600}), 'c2ln'].join('.');
  const rows = [];
  await page.route('https://*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data;
    if (path.endsWith('/token')) data = {user,access_token:token,refresh_token:'test-session',token_type:'bearer',expires_in:3600};
    else if (path.endsWith('/user')) data = user;
    else if (path.endsWith('/rb_my_profile')) data = [];
    else if (path.endsWith('/rb_my_applications')) data = rows;
    else if (path.endsWith('/rb_submit_application')) {
      const body = route.request().postDataJSON();
      expect(body.p_belt).toBe('blue');
      expect(body.p_interest).toBe('gp');
      expect(body.p_contact_consent).toBe(true);
      rows.push({id,interest:'gp',suggested_realm:'Zaphire Trials',status:'submitted',submitted_at:new Date().toISOString()});
      data = id;
    } else if (path.endsWith('/logout')) data = {};
    else throw new Error('Unexpected auth route '+path);
    await route.fulfill({json:data});
  });
  await page.goto('/competir.html?belt=blue&interest=gp&lang=es');
  await page.getByLabel('Correo electrónico').fill(user.email);
  await page.getByLabel('Contraseña', {exact:true}).fill('test-password');
  await page.getByRole('button',{name:'Iniciar sesión'}).click();
  await page.getByLabel('Nombre o alias').fill('Test');
  await page.getByLabel('Ciudad',{exact:true}).fill('Quito');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Enviar postulación'}).click();
  await expect(page.locator('#feedback')).toContainText('¡Gracias por postularte!');
  await expect(page.locator('#receipts')).toContainText(id);
  await page.locator('#langToggle').click();
  await expect(page.locator('#feedback')).toContainText('Thanks for applying!');
  await page.locator('#langToggle').click();
  await page.reload();
  await expect(page.locator('#receipts')).toContainText('Postulación recibida');
  await page.locator('#langToggle').click();
  await expect(page.locator('#receipts')).toContainText('Application received');
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page.locator('#application')).toBeHidden();
  await expect(page.locator('#receipts')).toBeEmpty();
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
