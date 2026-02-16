/**
 * @param {{ currentSort?: string, currentFilter?: string }} options
 */
export function renderSortFilterHTML({ currentSort = "newest", currentFilter = "all" } = {}) {
  function activeClass(value, current) {
    return value === current ? " is-active" : "";
  }

  return `
    <div id="sort-filter-dropdown" class="sort-filter-dropdown">
      <div class="sort-filter-section">
        <p class="sort-filter-label">Sort</p>
        <div class="sort-filter-options">
          <button class="sort-filter-option${activeClass("newest", currentSort)}" type="button" data-sort="newest">Newest</button>
          <button class="sort-filter-option${activeClass("oldest", currentSort)}" type="button" data-sort="oldest">Oldest</button>
          <button class="sort-filter-option${activeClass("az", currentSort)}" type="button" data-sort="az">A-Z</button>
          <button class="sort-filter-option${activeClass("za", currentSort)}" type="button" data-sort="za">Z-A</button>
        </div>
      </div>
      <div class="sort-filter-section">
        <p class="sort-filter-label">Filter</p>
        <div class="sort-filter-options">
          <button class="sort-filter-option${activeClass("all", currentFilter)}" type="button" data-filter="all">All</button>
          <button class="sort-filter-option${activeClass("text", currentFilter)}" type="button" data-filter="text">Text</button>
          <button class="sort-filter-option${activeClass("image", currentFilter)}" type="button" data-filter="image">Image</button>
          <button class="sort-filter-option${activeClass("link", currentFilter)}" type="button" data-filter="link">Link</button>
          <button class="sort-filter-option${activeClass("file", currentFilter)}" type="button" data-filter="file">File</button>
        </div>
      </div>
    </div>
  `;
}

export function querySortFilterEls(root) {
  return {
    sortFilterDropdown: root.querySelector("#sort-filter-dropdown"),
  };
}

export function initSortFilter(els, { onSortChange, onFilterChange, onToggle }) {
  const handlers = [];

  function addHandler(target, event, handler, options) {
    if (!target) return;
    target.addEventListener(event, handler, options);
    handlers.push(() => target.removeEventListener(event, handler, options));
  }

  addHandler(els.sortFilterDropdown, "click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.sort) {
      // Update active state
      els.sortFilterDropdown.querySelectorAll("[data-sort]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.sort === target.dataset.sort);
      });
      if (onSortChange) onSortChange(target.dataset.sort);
    } else if (target.dataset.filter) {
      els.sortFilterDropdown.querySelectorAll("[data-filter]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.filter === target.dataset.filter);
      });
      if (onFilterChange) onFilterChange(target.dataset.filter);
    }
  });

  // Outside-click to close
  function handleOutsideClick(event) {
    if (!els.sortFilterDropdown?.classList.contains("is-open")) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (els.sortFilterDropdown?.contains(target)) return;
    if (els.toolbarSortBtn?.contains(target)) return;
    els.sortFilterDropdown?.classList.remove("is-open");
  }

  document.addEventListener("click", handleOutsideClick);
  handlers.push(() => document.removeEventListener("click", handleOutsideClick));

  return () => handlers.forEach((dispose) => dispose());
}

export function toggleSortFilterDropdown(els) {
  els.sortFilterDropdown?.classList.toggle("is-open");
}

export function closeSortFilterDropdown(els) {
  els.sortFilterDropdown?.classList.remove("is-open");
}
