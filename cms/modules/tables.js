/**
 * Table Management Module for Grieche-CMS (Visual Planner Entry)
 */

import { renderTablePlanner } from './table-planner.js';

export async function renderTableManager(container, titleEl) {
    // We delegate the rendering to the visual table planner
    await renderTablePlanner(container, titleEl);
}
