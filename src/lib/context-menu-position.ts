type Rectangle={left:number;top:number;right:number;bottom:number};

export function contextMenuPosition(anchor:Rectangle, viewport:Rectangle, naturalHeight:number) {
 const inset=12,gap=8;
 const width=Math.max(0,Math.min(340,viewport.right-viewport.left-inset*2));
 const minX=viewport.left+inset,maxX=viewport.right-inset-width;
 const minY=viewport.top+inset,maxY=viewport.bottom-inset;
 const maxHeight=Math.max(0,maxY-minY);
 const below=maxY-anchor.bottom-gap,above=anchor.top-gap-minY;
 const fitsBelow=below>=naturalHeight, fitsAbove=above>=naturalHeight;
 const goesBelow=fitsBelow||(!fitsAbove&&below>=above);
 const sideSpace=goesBelow?below:above;
 // Scroll shorter menus along the preferred edge, but use the viewport on very tight heights.
 const height=Math.min(naturalHeight, Math.min(maxHeight,Math.max(Math.min(180,maxHeight),sideSpace)));
 const preferredTop=goesBelow?anchor.bottom+gap:anchor.top-gap-height;
 return {left:Math.max(minX,Math.min(maxX,anchor.right-width)),top:Math.max(minY,Math.min(maxY-height,preferredTop)),width,maxHeight:height};
}
