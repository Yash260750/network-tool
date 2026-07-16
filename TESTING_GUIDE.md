# NetMap — Manual Testing Guide

Run through this top to bottom after any backend or frontend change. Each
step says what to do and what you should see. If a step doesn't match,
that's your bug report — note the step number.

---

## 0. Setup check

1. Start the app: `pnpm dev` (or your usual command).
2. Confirm both processes come up clean in the terminal:
   - `[0] INFO: Uvicorn running on http://127.0.0.1:8000`
   - `[1] VITE ... ready`
3. Open `http://localhost:5173`. You should see the dashboard, not a blank
   screen or console error.
4. Open browser DevTools → Console. Keep it open for the rest of this
   guide — any red error during the steps below is worth stopping on.
5. Open DevTools → Network, filter by "Fetch/XHR". You'll use this to
   confirm requests actually hit the backend and return 2xx.

**If step 3 fails:** check the terminal for a Postgres/SQLAlchemy error —
usually means the DB schema is stale (see the migration notes from earlier
in this conversation).

---

## 1. Dashboard

1. Navigate to **Dashboard Grid** (sidebar).
2. If you have zero devices, you should see "No metrics calculated yet"
   and "No managed records mapped" — not a crash.
3. Stat tiles (Total/Online/Warning/Offline) should show `0` cleanly.
4. The three shortcut cards (Trace a Cable / View Rack / Floor Map) should
   navigate correctly when clicked.

*(Come back to this section after Section 2 — with real devices, verify
the counts and "Device Breakdown" bars match reality, and that clicking a
device in "Recent Infrastructure Additions" opens its panel.)*

---

## 2. Devices — create, read, update, delete

### 2.1 Create
1. Go to **Asset Directory** → **Add Asset**.
2. Fill in: Name `TEST-PC-01`, Type `pc`, Hostname `test-pc-01.local`,
   IP `10.0.0.50`, MAC `00:1A:2B:3C:4D:5E`, VLAN `10`, Owner `QA`,
   Room `Room 101`, Floor `1`, Rack `East Cabinet`, Rack Unit `5`.
3. Submit. Modal should close, and `TEST-PC-01` should appear in the table
   immediately (no refresh needed).
4. **Network tab check:** `POST /devices/` → `200`. Response body should
   echo back `room: "Room 101"`, `rack: "East Cabinet"`, `floor: 1`.

### 2.2 Read / persistence
1. **Hard refresh the page** (Ctrl/Cmd+Shift+R).
2. `TEST-PC-01` should still be there with all the same field values.
   This is the check that catches the "looks saved but isn't" bug class —
   don't skip it.

### 2.3 Update
1. Click the `TEST-PC-01` row → its panel opens on the right.
2. Click **Edit**. Change: Owner → `QA Team`, VLAN → `20`, Status →
   `warning`, Room → `Room 202`, Rack → `West Cabinet`, Floor → `2`.
3. Click **Save**.
4. **Network tab check:** `PATCH /devices/{id}` → `200`.
5. Panel should immediately reflect the new values.
6. **Hard refresh again.** Re-open the device — every changed field
   (including Room/Rack/Floor) must still show the new values. If any of
   these revert after refresh, the save isn't actually persisting.

### 2.4 Delete
1. Open `TEST-PC-01`'s panel → click the trash icon in the header.
2. Confirm the browser confirm dialog.
3. Row should disappear from the table immediately.
4. Refresh — it should stay gone (not reappear).

### 2.5 Search / filter
1. Create two more devices with distinct names/IPs/owners if you don't
   already have them.
2. In **Asset Directory**'s filter box, search by partial name, then by
   IP, then by owner. Each should narrow the table correctly.
3. Clear the filter — full list returns.

---

## 3. Ports & Connections

Do this with at least two devices (e.g. a `switch` and a `pc`).

### 3.1 Add a port
1. Open the `pc` device's panel.
2. Under **Ports & Connections**, type a port number (e.g. `eth0`), leave
   type as `rj45`, click **Add**.
3. Port should appear in the list immediately, labeled "Unconnected"
   (dropdown + Link button visible).
4. **Network check:** `POST /ports/` → `200`.
5. Refresh the page, reopen the panel — the port should still be there.

### 3.2 Duplicate port number (expected failure)
1. Try adding a port with the *same* number again on the *same* device.
2. Expect an alert: "This device already has a port with that number."
   This should **not** crash the app or leave a ghost row.

### 3.3 Add a second port on another device
1. Open the `switch` device's panel, add a port (e.g. `Gi1/0/1`).

### 3.4 Connect two ports
1. Back on the `pc` device's port, use the "Connect to…" dropdown —
   the switch's `Gi1/0/1` should be listed as `SwitchName — Gi1/0/1`.
2. Select it, click **Link**.
3. **Network check:** `POST /connections/` → `200`.
4. The port row should now show `↔ SwitchName — Gi1/0/1` with a
   **Disconnect** button, instead of the dropdown.
5. Open the switch's panel too — its `Gi1/0/1` port should *also* show
   the reverse connection back to the PC. (Same connection, viewed from
   either side — this is the key check that the graph is bidirectional.)

### 3.5 Reject duplicate/self connections
1. Try connecting the same two ports again. Expect: alert "These ports are
   already connected" (409), no duplicate connection created.
2. Try connecting a port to itself if the UI allows selecting it — expect
   a clean rejection, not a crash.

### 3.6 Disconnect
1. Click **Disconnect** on either side.
2. Both ports should return to "Unconnected" state.
3. Refresh — stays disconnected (not still connected).

### 3.7 Delete a port
1. Delete one of the test ports (trash icon next to it).
2. Confirm dialog → port disappears.
3. If that port had an active connection, confirm the connection is also
   gone from the other port's view (cascade delete).

---

## 4. Cable Tracer

Set up a short chain first: PC → port → connected to → Wall Jack port →
connected to → Patch Panel port → connected to → Switch port. (Reuse the
ports/connections steps above across four devices.)

### 4.1 Search and select
1. Go to **Cable Layer Trace**.
2. Type part of the PC's name into the search box. It should appear in
   the results dropdown with a port count badge.
3. Click it.

### 4.2 Single vs. multiple ports
1. If the device has exactly **one** port, the trace should run
   automatically (no extra click needed) and animate hop-by-hop.
2. If it has **more than one** port, you should instead see a row of
   port-choice buttons ("Select a port to trace"). Click one to start
   the trace.
3. **Network check:** `GET /trace/{port_id}` → `200`, no console errors
   (this is the request that previously crashed with `MissingGreenlet` —
   confirm that's gone).

### 4.3 Verify the hop chain
1. Each hop card should show the correct device name, device type icon,
   port number, and hop number.
2. The first hop should say "Trace start" (no connection ID); every hop
   after should say "Hop N · via Connection #X".
3. The chain should match the physical path you actually wired up in
   Section 3 — same devices, same order.

### 4.4 Dead end / no ports
1. Pick a device with zero ports. Expect the message "No ports registered
   for this device yet…" — not a crash or empty white space.
2. Pick a device whose one port has no connection. Trace should show just
   the single starting hop, then the "trace ended (dead end)" note.

### 4.5 Inspect from tracer
1. While a device is selected in the tracer, click **Inspect Node
   Properties** — its panel should open in a side drawer, editable as
   normal.

---

## 5. Rack Cabinet View

### 5.1 Basic layout
1. Go to **Rack Cabinet Elevation**. Confirm East/West cabinets render
   with 16 U slots each, and the floor switcher (01–04) works.
2. Rename a cabinet (edit the text input at the top of a cabinet) —
   should save instantly (this one's local-only via localStorage, so no
   network call expected here — that's correct, not a bug).

### 5.2 Mount via the modal
1. Find a device in the "Available Buffer Stack" (unassigned on this
   floor). Click **Mount**.
2. Pick a cabinet + U position in the modal, submit.
3. Device should now appear in that exact slot.
4. **Refresh the page.** Device must still be in that slot — this is the
   exact bug class from before; don't skip the refresh check.

### 5.3 Drag-and-drop — basic move
1. Drag a mounted device from one slot to an **empty** slot (same or
   other cabinet).
2. While dragging over a valid slot, it should highlight cyan and say
   "Drop to mount here."
3. Drop it. Device should appear in the new slot immediately.
4. Refresh — position should stick.

### 5.4 Drag-and-drop — swap
1. Drag a mounted device onto a slot that's **already occupied** by a
   different device.
2. Both devices should swap positions (the one you dragged takes the new
   slot; the one that was there takes your dragged device's old slot).
3. Refresh — swap should persist for both devices.

### 5.5 Drag-and-drop — un-rack via buffer stack
1. Drag a mounted device onto the "Available Buffer Stack" panel.
2. It should disappear from its rack slot and reappear in the buffer
   stack list.
3. Refresh — should stay unassigned (not silently re-appear in the rack).

### 5.6 Drag a device that was never racked
1. Drag a device directly from the buffer stack onto an empty rack slot.
2. Should mount cleanly.
3. Drag a buffer-stack device onto an **occupied** slot — the occupant
   should get bumped to the buffer stack (not left in limbo or duplicated).

### 5.7 Patch bridge (ports/connections from the rack view)
1. Hover a mounted device, click **Patch**. Amber "Patch Bridge Mode"
   panel should appear.
2. If the device has no ports yet, you should see an inline "quick add
   port" input instead of a dropdown — add one, it should auto-select.
3. Pick a target port from another device on the same floor.
4. Click **Bridge Patch Jumper Link**. Panel should close.
5. Verify in that device's panel (or the Tracer) that the connection was
   actually created — same check as Section 3.4.

---

## 6. Floor Map

1. Go to **Spatial Floor Map**, pick a floor.
2. Select an unplaced device from the dropdown, click **Place Dot
   Marker** — it should appear centered on the map and become selected.
3. Drag the dot around — position should update live.
4. Refresh the page — dot position should still be there (this one is
   localStorage-backed by design, not backend — so "persists after
   refresh" is still the correct expectation, just not server-synced
   across machines/browsers).
5. Upload a floorplan image (any PNG/JPG) — it should render as the map
   background for that floor only.
6. Click **Reset Layout**, confirm the dialog — all dots and floorplans
   should clear across all floors.

---

## 7. Cross-cutting checks

Run these last, since they depend on everything above already working.

1. **Consistency across views:** a device moved in Rack View should show
   the updated room/rack/floor in Asset Directory and Dashboard without
   a manual refresh (all views share the same fetched state).
2. **No orphaned data:** delete a device that has ports/connections —
   confirm (via Network tab or by trying to trace) that its ports and
   connections are actually gone, not left dangling.
3. **Validation errors surface cleanly:** try creating a device with an
   invalid MAC address (e.g. `not-a-mac`) or invalid IP (`999.999.999.999`)
   — expect a clear validation alert, not a silent failure or crash.
4. **Console is clean:** scroll back through DevTools console for the
   whole session — no red errors should have appeared at any step above.

---

## Quick reference — what should hit the network, and what shouldn't

| Action | Expected request |
|---|---|
| Add/edit/delete device | `POST` / `PATCH` / `DELETE` `/devices/` |
| Add/delete port | `POST` / `DELETE` `/ports/` |
| Link/unlink ports | `POST` / `DELETE` `/connections/` |
| Run a trace | `GET` `/trace/{port_id}` |
| Rename a rack cabinet | **none** (localStorage only) |
| Move a floor map dot | **none** (localStorage only) |
| Upload a floorplan image | **none** (localStorage only, as a data URL) |

If something in the left column isn't producing the request in the right
column, that's the bug — it means the UI updated local state without the
backend ever being told.
