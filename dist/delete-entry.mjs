export function confirmRemoval(items, id, confirm, detail = 'This cannot be undone.') {
 const item = items.find(item => item.id === id);
 if (!item || !confirm(`Delete “${item.caption || item.title}”?\n\n${detail}`)) return null;
 return items.filter(item => item.id !== id);
}

export function deleteMemory(collections, kind, id, confirm) {
 const list = collections[kind];
 if (!list) return false;
 const next = confirmRemoval(list, id, confirm, kind === 'books'
  ? 'Only this book is deleted. Its moments and keepsakes stay in your collection.'
  : 'This removes the entry from this collection and any memory books.');
 if (!next) return false;
 list.splice(0, list.length, ...next);
 if (kind !== 'books') for (const book of collections.books) {
  const field = kind === 'moments' ? 'ids' : 'keepsakeIds';
  book[field] = book[field].filter(value => value !== id);
 }
 return true;
}
