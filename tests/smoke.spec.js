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

test('Realm Nexus process navigation works without page-script exceptions', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/realm-nexus.html?lang=en');
  await expect(page.locator('#track .realm-card')).toHaveCount(7);
  await expect(page.locator('#realmTitle')).toHaveText('WHITE CARBON COMBAT');
  await page.locator('#next').click();
  await expect(page.locator('#realmTitle')).toHaveText('ZAPHIRE TRIALS');
  await page.locator('#prev').click();
  await expect(page.locator('#realmTitle')).toHaveText('WHITE CARBON COMBAT');
  await expect(page.locator('#processNumber')).toHaveText('PROTOCOL 01 / 06');
  await page.locator('#processNext').click();
  await expect(page.locator('#processNumber')).toHaveText('PROTOCOL 02 / 06');
  await expect(page.locator('#processTitle')).toContainText('ROSTER & REGISTRATION');
  await page.locator('#processPrev').click();
  await expect(page.locator('#processNumber')).toHaveText('PROTOCOL 01 / 06');
  await assertNoRuntimeErrors(errors);
});

test('shop product lightbox still opens and closes', async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto('/shop.html');
  const lightbox = page.locator('#productLightbox');
  await expect(lightbox).toBeHidden();
  await page.locator('.product-gallery img').first().click();
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
  await expect(page.locator('.hero .kicker')).toContainText('QUITO');
  await page.locator('#langToggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#burger').click();
  await page.getByRole('navigation').getByRole('link', { name: 'Fighters' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.goto('/?lang=es');
  await page.locator('.realm-links').nth(3).getByRole('link', { name: 'Oxide Overdrive' }).click();
  await expect(page.locator('#gpArchiveTitle')).toHaveText('Oxide Overdrive');
  await expect(page.locator('#gpArchiveOverlay')).toBeVisible();
});

test('athlete inquiry validates, prepares a private email draft and supports both languages', async ({ page }) => {
  await page.goto('/');
  await page.locator('.hero-ctas').getByRole('link', { name: 'Quiero competir' }).click();
  await page.getByRole('button', { name: 'Preparar correo' }).click();
  await expect(page.locator('#email-preview')).toBeHidden();
  await page.getByLabel('Nombre o alias').fill('Atleta de prueba');
  await page.getByLabel('Correo electrónico').fill('test@example.com');
  await page.getByLabel('Ciudad', { exact: true }).fill('Quito');
  await page.getByLabel('Disciplina o cinturón').fill('BJJ');
  await page.getByLabel('Me interesa').selectOption('gp');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Preparar correo' }).click();
  await expect(page.locator('#send-inquiry')).toHaveAttribute('href', /^mailto:raazborgstudios@gmail\.com\?/);
  await expect(page.locator('#email-body')).toHaveValue(/Interés: Competir en el Grand Prix/);
  await page.locator('#langToggle').click();
  await expect(page.locator('#email-body')).toHaveValue(/Interest: Competing in the Grand Prix/);
  await page.getByLabel('City', { exact: true }).fill('Tumbaco');
  await expect(page.locator('#email-preview')).toBeHidden();
});
