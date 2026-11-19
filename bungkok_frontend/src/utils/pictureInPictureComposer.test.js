import test from 'node:test';
import assert from 'node:assert/strict';
import { pictureInPictureLayout } from './pictureInPictureComposer.js';

test('Figma camera frames keep their portrait PiP canvas and safe video bounds', () => {
  for (const id of ['frame-sadar', 'frame-turns-on']) {
    const layout = pictureInPictureLayout(id);
    assert.equal(layout.width / layout.height, 0.8);
    assert.ok(layout.videoWidth > 0 && layout.videoHeight > 0);
    assert.ok(layout.x + layout.videoWidth <= layout.width);
    assert.ok(layout.y + layout.videoHeight <= layout.height);
  }
});
