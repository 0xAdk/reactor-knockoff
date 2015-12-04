/*

TODO:

Before release:
selling
Auto save
particle accelerator6
adjust ui
header buttons
finish help section
fix upgrade/experiment display
full reset
figure out reflector experiment upgrade
Options page - exponential formatting
Statistics
forceful fusion testing
mobile ui - sliding panels
unshift vents - vent6 power issue?
test speed of loops
try big int library
ui.js - put purely ui control stuff in there
parts ui adjust (up/down go away)
browser testing
fix close/delete buttons on tooltip
Make sure clicking on upgrades only purchases if that upgrade's tooltip is visible (mobile)
hide ticks on upgrade tooltips
hide various stats on un-enabled parts' tooltips
make stats unlockable

Maybe before:
"story" objectives
new cells
tooltip
modal messages
Bundling cells to 9+
towns with different power needs and compensation

After:
shift + right click on spent cells also gets rid of unspent cells
document part/upgrade keys
right click to sell upgrades?
refactor code
break into multiple files?
shift+click on empty tiles to fill them
achievement system
save layouts
multiple reactors

console.log
*/


;(function() {
'use strict';

  /////////////////////////////
 // Delegate
/////////////////////////////

Element.prototype.delegate = function(className, type, fn) {
	var test = new RegExp('\\b' + className + '\\b');
	var $self = this;

	var onfn = function(event) {
		event = event || window.event;
		var $target = event.target || event.srcElement;

		while( $target != $self ) {
			if ( $target.className.match(test) ) {
				return fn.call($target, event);
			}

			$target = $target.parentNode;
		}
	}

	if ( type === 'focus' || type === 'blur' ) {
		this.addEventListener(type, onfn, true);
	} else {
		this['on' + type] = onfn;
	}
}

  /////////////////////////////
 // fauxQuery
/////////////////////////////

var _div = document.createElement('div');
var $ = function(a1) {
	if ( typeof a1 === 'string' ) {
		if ( a1.match(/^<[^>]+>$/) ) {
			_div.innerHTML = a1;
			return _div.firstChild;
		} else if ( a1.match(/^#[^ ]+$/) ) {
			return document.getElementById(a1.substring(1))
		}
	}
}

  /////////////////////////////
 // Number formatting
/////////////////////////////

var cm_names = ("K M B T Qa Qi Sx Sp Oc No Dc").split(" ");

var pow;
var fnum;
var find_exponent = /(([1-9])(\.([0-9]+))?)e\+([0-9]+)/;
var fmt_parts;
var floor_num;

var fmt = function(num, places) {
	places = places || null;

	// Math.floor returns exponents quicker for some reason
	floor_num = Math.floor(num).toString();

	if ( places !== null ) {
		pow = Math.floor((floor_num.length - 1)/3) * 3;
		num = Math.round(num / Math.pow(10, pow - places)) * Math.pow(10, pow - places);
	}

	// in case of exponents
	if ( (fmt_parts = floor_num.match(find_exponent)) ) {
		places = places || 3;

		// Out of range of the friendly numbers
		if ( fmt_parts[5] > 35 ) {
			fnum = fmt_parts[2] + (fmt_parts[3]?fmt_parts[3].substring(0, places + 1):'') + 'e' + fmt_parts[5];
		// has a decimal
		} else if ( fmt_parts[3] ) {
			num = fmt_parts[2] + fmt_parts[4] + '00';
			fnum = parseFloat(num.substring(0, fmt_parts[5] % 3 + 1) + '.' + num.substring(fmt_parts[5] % 3 + 1, fmt_parts[5] % 3 + places + 1)) + cm_names[Math.floor(fmt_parts[5]/3) - 1];
		} else {
			num = fmt_parts[2] + '00';
			fnum = num.substring(0, fmt_parts[5] % 3 + 1) + cm_names[Math.floor(fmt_parts[5]/3) - 1];
		}
	} else {
		// http://userscripts-mirror.org/scripts/review/293573
		pow = Math.floor((floor_num.length - 1)/3) * 3;
		fnum = (Math.floor(num / Math.pow(10, pow - 3)) / Math.pow(10, 3)) + (pow === 0 ? "" : cm_names[(pow / 3) - 1]);
	}

	return fnum;
};

  /////////////////////////////
 // General
/////////////////////////////

// settings
var base_cols = 12;
var base_rows = 9;
var max_cols = 22;
var max_rows = 19;
var debug = false;
var base_loop_wait = 1000;
var base_power_multiplier = 1;
var base_heat_multiplier = 4;
var base_manual_heat_reduce = 1;
var upgrade_max_level = 32;
var base_max_heat = 1000;
var base_max_power = 100;

// Current
var current_heat;
var current_power;
var current_money;
var max_heat;
var auto_sell_multiplier;
var max_power;
var loop_wait;
var power_multiplier;
var heat_multiplier;
var manual_heat_reduce;
var vent_capacitor_multiplier;
var vent_plating_multiplier;
var transfer_capacitor_multiplier;
var transfer_plating_multiplier;
var heat_power_multiplier;
var heat_controlled;
var altered_max_heat;
var altered_max_power;
var cols;
var rows;

var paused = false;
var auto_sell_disabled = false;
var auto_buy_disabled = false;
var exotic_particles = 0;
var current_exotic_particles = 0;
var total_exotic_particles = 0;

var set_defaults = function() {
	current_heat = 0;
	current_power = 0;
	current_money = 10;
	cols = base_cols;
	rows = base_rows;
	max_heat = base_max_heat;
	auto_sell_multiplier = 0;
	max_power = base_max_power;
	loop_wait = base_loop_wait;
	power_multiplier = base_power_multiplier;
	heat_multiplier = base_heat_multiplier;
	manual_heat_reduce = base_manual_heat_reduce;
	vent_capacitor_multiplier = 0;
	vent_plating_multiplier = 0;
	transfer_capacitor_multiplier = 0;
	transfer_plating_multiplier = 0;
	heat_power_multiplier = 0;
	heat_controlled = 0;
	altered_max_heat = base_max_heat;
	altered_max_power = base_max_power;
};

set_defaults();

// Mark ios since it's an idiot with mouseover events


var is_ios = navigator.userAgent.match(/(iPod|iPhone|iPad)/) ? true : false;

  /////////////////////////////
 // Reboot
/////////////////////////////

var $reboot = $('#reboot');
var $refund = $('#refund');

var reboot = function(refund) {
	var response = confirm("Are you sure?");

	if ( !response ) return;

	clearTimeout(loop_timeout);

	set_defaults();

	for ( ri = 0; ri < max_rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < max_cols; ci++ ) {
			tile = row[ci];
			remove_part(tile, true);

			if ( ri >= rows || ci >= cols ) {
				tile.disable();
			}
		}
	}

	total_exotic_particles += exotic_particles;

	if ( refund === true ) {
		for ( i = 0, l = upgrade_objects_array.length; i < l; i++ ) {
			upgrade = upgrade_objects_array[i];
			upgrade.setLevel(0);
		}

		current_exotic_particles = total_exotic_particles;
	} else {
		for ( i = 0, l = upgrade_objects_array.length; i < l; i++ ) {
			upgrade = upgrade_objects_array[i];

			if ( !upgrade.ecost ) {
				upgrade.setLevel(0);
			} else {
				upgrade.setLevel(upgrade.level);
			}
		}

		current_exotic_particles += exotic_particles;
	}

	update_tiles();

	exotic_particles = 0;

	$exotic_particles.innerHTML = '0';
	$reboot_exotic_particles.innerHTML = '0';
	$current_exotic_particles.innerHTML = fmt(exotic_particles);

	update_nodes();

	game_loop();
};

$reboot.onclick = reboot;

$refund.onclick = function() {
	reboot(true);
}

// For iteration
var i;
var l;
var ri;
var pi;
var pl;
var ci;
var row;
var tile;
var upgrade;
var single_cell_description = 'Produces %power power and %heat heat per tick. Lasts for %ticks ticks.';
var multi_cell_description = 'Acts as %count %type cells. Produces %power power and %heat heat per tick.';

// Other vars
var tiles = [];
var unaffordable_replace = /[\s\b]unaffordable\b/;

  /////////////////////////////
 // Tiles
/////////////////////////////

var enabled_class = 'enabled';
var enabled_find = new RegExp('[\\s\\b]' + enabled_class + '\\b');

var Tile = function(row, col) {
	this.$el = $('<button class="tile">');
	this.$el.tile = this;
	this.part = null;
	this.heat = 0;
	this.heat_contained = 0;
	this.display_heat = null;
	this.power = 0;
	this.ticks = 0;
	this.containments = [];
	this.cells = [];
	this.activated = false;
	this.row = row;
	this.col = col;
	this.enabled = false;

	var $percent_wrapper_wrapper = $('<div class="percent_wrapper_wrapper">');
	var $percent_wrapper = $('<div class="percent_wrapper">');
	this.$percent = $('<p class="percent">');

	$percent_wrapper_wrapper.appendChild($percent_wrapper);
	$percent_wrapper.appendChild(this.$percent);
	this.$el.appendChild($percent_wrapper_wrapper);

	if ( debug ) {
		this.$heat = $('<span class="heat">');
		this.$heat.innerHTML = fmt(this.heat);
		this.$el.appendChild(this.$heat);

		this.$power = $('<span class="power">');
		this.$power.innerHTML = fmt(this.power);
		this.$el.appendChild(this.$power);
	}
};

Tile.prototype.disable = function() {
	this.$el.className = this.$el.className.replace(enabled_find, '');
	this.enabled = false;
};

Tile.prototype.enable = function() {
	this.$el.className += ' ' + enabled_class;
	this.enabled = true;
};

// Operations
var tile_containment;
var tile_cell;
var tile_part;
var heat_remove;
var heat_outlet_countainments_count;
var transfer_multiplier = 0;
var vent_multiplier = 0;
var ri2;
var ci2;
var tile2;
var tile_part2;
var range;

var stat_vent;
var stat_inlet;
var stat_outlet;

var update_tiles = function() {
	heat_outlet_countainments_count = 0;
	transfer_multiplier = 0;
	vent_multiplier = 0;
	max_power = altered_max_power;
	max_heat = altered_max_heat;

	stat_vent = 0;
	stat_inlet = 0;
	stat_outlet = 0;

	for ( ri = 0; ri < max_rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < max_cols; ci++ ) {
			tile = row[ci];

			if ( tile.enabled === false && ci < cols && ri < rows ) {
				tile.enable();
			}
		}
	}

	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile_part = tile.part;

			// Zero out heat and power
			tile.heat = 0;
			tile.power = 0;

			// collect stats
			if ( tile_part && tile.activated ) {
				if ( tile_part.vent ) {
					stat_vent += tile_part.vent;
				}
			}
		}
	}

	// Alter counts
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile_part = tile.part;
			tile.containments.length = 0;
			tile.cells.length = 0;

			if ( tile_part && tile.activated && (tile_part.category !== 'cell' || tile.ticks) ) {
				range = tile.part.range || 1;

				// Find containment parts and cells within range
				for ( ri2 = 0; ri2 < rows; ri2++ ) {
					for ( ci2 = 0; ci2 < cols; ci2++ ) {
						if ( (Math.abs(ri2 - ri) + Math.abs(ci2 - ci)) <= range ) {
							if ( ri2 === ri && ci2 === ci ) {
								continue;
							}

							tile2 = tiles[ri2][ci2];

							if ( tile2.part && tile2.activated && tile2.part.containment ) {
								if ( tile.part.category === 'vent' || tile.part.id === 'coolant_cell6' ) {
									tile.containments.unshift(tile2);
								} else {
									tile.containments.push(tile2);
								}
							} else if ( tile2.part && tile2.activated && tile2.part.category === 'cell' ) {
								tile.cells.push(tile2);
							}
						} else if ( tile_part.id === 'heat_exchanger6' && ri2 === ri ) {
							// TODO: repeated code from above
							if ( ri2 === ri && ci2 === ci ) {
								continue;
							}

							tile2 = tiles[ri2][ci2];

							if ( tile2.part && tile2.activated && tile2.part.containment ) {
								tile.containments.push(tile2);
							}
						}
					}
				}
			}

			if ( tile_part && tile.activated ) {
				if ( tile_part.category === 'heat_outlet' ) {
					heat_outlet_countainments_count += tile.containments.length;
				} else if ( tile_part.category === 'capacitor' ) {
					transfer_multiplier += tile_part.part.level * transfer_capacitor_multiplier;
					vent_multiplier += tile_part.part.level * vent_capacitor_multiplier;
				} else if ( tile_part.category === 'reactor_plating' ) {
					transfer_multiplier += tile_part.part.level * transfer_plating_multiplier;
					vent_multiplier += tile_part.part.level * vent_plating_multiplier;
				}

				if ( tile_part.category === 'heat_inlet' ) {
					stat_inlet += tile_part.transfer * tile.containments.length;
				}

				if ( tile_part.category === 'heat_outlet' ) {
					stat_outlet += tile_part.transfer * tile.containments.length;
				}
			}
		}
	}

	// Heat and power generators
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile_part = tile.part;

			if ( tile_part && tile.activated ) {
				if ( tile_part.category === 'cell' && tile.ticks ) {
					tile.heat += tile_part.heat;
					tile.power += tile_part.power;
					tile.display_heat = tile.heat;
					tile.display_power = tile.power;

					// Neighbor Cells
					for ( i = 0, l = tile.cells.length; i < l; i++ ) {
						tile2 = tile.cells[i];
						tile2.heat += tile_part.heat * heat_multiplier;
						tile2.power += tile_part.power * power_multiplier;
						tile2.display_heat = tile2.heat;
						tile2.display_power = tile2.power;
					}
				}
			}

		}
	}

	// Cells
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile_part = tile.part;

			if ( tile_part && tile.activated ) {
				if ( tile_part.category === 'cell' ) {
					l = tile.containments.length;

					if ( l ) {
						heat_remove = Math.ceil(tile.heat / l);

						for ( i = 0; i < l; i++ ) {
							tile_containment = tile.containments[i];
							tile.heat -= heat_remove;
							tile_containment.heat += heat_remove;
						}
					}
				}
			}
		}
	}

	// Reflectors
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile_part = tile.part;

			if ( tile_part && tile.activated ) {
				if ( tile_part.category === 'reflector' ) {
					l = tile.cells.length;

					if ( l ) {
						for ( i = 0; i < l; i++ ) {
							tile_cell = tile.cells[i];
							tile.power += tile_cell.power * ( tile_part.power_increase / 100 );

							if ( tile_part.heat_increase ) {
								tile.heat += tile_cell.heat * ( tile_part.heat_increase / 100 );
							}
						}
					}
				}
			}
		}
	}

	// Capacitors/Plating
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile_part = tile.part;

			if ( tile_part && tile.activated && tile_part.reactor_power ) {
				max_power += tile_part.reactor_power;
			}

			if ( tile_part && tile.activated && tile_part.reactor_heat ) {
				max_heat += tile_part.reactor_heat;
			}

			if ( tile_part && tile_part.id === 'reactor_plating6' ) {
				max_power += tile_part.reactor_heat;
			}
		}
	}

	$max_power.innerHTML = fmt(max_power);
	$max_heat.innerHTML = fmt(max_heat);

	$stats_vent.innerHTML = fmt(stat_vent * (1 + vent_multiplier / 100), 2);
	$stats_inlet.innerHTML = fmt(stat_inlet * (1 + transfer_multiplier / 100), 2);
	$stats_outlet.innerHTML = fmt(stat_outlet * (1 + transfer_multiplier / 100), 2);

	if ( debug ) {
		for ( ri = 0; ri < rows; ri++ ) {
			row = tiles[ri];

			for ( ci = 0; ci < cols; ci++ ) {
				tile = row[ci];
				tile.$heat.innerHTML = fmt(tile.heat);
				tile.$power.innerHTML = fmt(tile.power);
			}
		}
	}
};

// get dom nodes cached
var $reactor = $('#reactor');
var $all_parts = $('#all_parts');

var $money = $('#money');
var $cooling = $('#cooling');
var $current_heat = $('#current_heat');
var $current_power = $('#current_power');
var $max_heat = $('#max_heat');
var $max_power = $('#max_power');
var $power_per_tick = $('#power_per_tick');
var $heat_per_tick = $('#heat_per_tick');
var $money_per_tick = $('#money_per_tick');
var $main = $('#main');
var $upgrades = $('#upgrades');
var $all_upgrades = $('#all_upgrades');
var $exotic_particles = $('#exotic_particles');
var $current_exotic_particles = $('#current_exotic_particles');
var $reboot_exotic_particles = $('#reboot_exotic_particles');
var $refund_exotic_particles = $('#refund_exotic_particles');

var $stats_vent = $('#stats_vent');
var $stats_inlet = $('#stats_inlet');
var $stats_outlet = $('#stats_outlet');
var $stats_cash = $('#stats_cash');
var $stats_power = $('#stats_power');
var $stats_heat = $('#stats_heat');

// Tooltip
var $tooltip = $('#tooltip');
var $tooltip_name = $('#tooltip_name');
var $tooltip_description = $('#tooltip_description');
var $tooltip_cost = $('#tooltip_cost');
var $tooltip_sells = $('#tooltip_sells');
var $tooltip_heat_per = $('#tooltip_heat_per');
var $tooltip_power_per = $('#tooltip_power_per');
var $tooltip_heat_wrapper = $('#tooltip_heat_wrapper');
var $tooltip_heat = $('#tooltip_heat');
var $tooltip_max_heat = $('#tooltip_max_heat');
var $tooltip_ticks_wrapper = $('#tooltip_ticks_wrapper');
var $tooltip_ticks = $('#tooltip_ticks');
var $tooltip_max_ticks = $('#tooltip_max_ticks');
var $tooltip_delete = $('#tooltip_delete');
var $tooltip_close = $('#tooltip_close');

if ( debug ) {
	$main.className += ' debug';
}

if ( 'ontouchstart' in window ) {
	$main.className += ' touch';
}

$max_heat.innerHTML = fmt(max_heat);
$max_power.innerHTML = fmt(max_power);

// create tiles
var $row;
for ( ri = 0; ri < max_rows; ri++ ) {
	$row = $('<div class="row">');
	$reactor.appendChild($row);
	row = [];

	for ( ci = 0; ci < max_cols; ci++ ) {
		tile = new Tile(ri, ci);
		row.push(tile);
		$row.appendChild(tile.$el);

		if ( ci <= cols || ri <= rows ) {
			tile.disable();
		}
	}

	tiles.push(row);
}

// Tile tooltips

// TODO: DRY this
var tooltip_tile = null;
var tile_tooltip_show = function(e) {
	var tile = this.tile;
	var part = tile.part;

	if ( !part ) return;

	if ( !tooltip_showing ) {
		$main.className += ' tooltip_showing';
	}

	part.showTooltip(tile);
	tooltip_showing = true;
	tooltip_tile = tile;
	tooltip_update = (function(tile) {
		return function() {
			part.updateTooltip(tile);
		};
	})(tile);
};

var tile_tooltip_hide = function(e) {
	tooltip_showing = false;
	tooltip_update = null;
	tooltip_tile = null;
	$main.className = $main.className.replace(tooltip_showing_replace, '');
};

if ( !is_ios ) {
	$reactor.delegate('tile', 'mouseover', tile_tooltip_show);
	$reactor.delegate('tile', 'mouseout', tile_tooltip_hide);
} else {
	$reactor.delegate('tile', 'touchend', tile_tooltip_show);
}

$reactor.delegate('tile', 'focus', tile_tooltip_show);
$reactor.delegate('tile', 'blur', tile_tooltip_hide);

  /////////////////////////////
 // Show Pages
/////////////////////////////

var showing_find = /[\b\s]showing\b/;

$main.delegate('nav', 'click', function(event) {
	var id = this.getAttribute('data-page');
	var section = this.getAttribute('data-section');
	var $page = $('#' + id);
	var $section = $('#' + section);
	var pages = $section.getElementsByClassName('page');

	for ( var i = 0, length = pages.length, $p; i < length; i++ ) {
		$p = pages[i];
		$p.className = $p.className.replace(showing_find, '');
	}

	$page.className += ' showing';

	// Page specific stuff
	if ( id == 'upgrades_section' || id == 'experimental_upgrades_section' ) {
		check_upgrades_affordability(true);
	} else {
		clearTimeout(check_upgrades_affordability_timeout);
	}
});

  /////////////////////////////
 // Parts
/////////////////////////////

var $cells = $('#cells');
var $reflectors = $('#reflectors');
var $capacitors = $('#capacitors');
var $vents = $('#vents');
var $heat_exchangers = $('#heat_exchangers');
var $heat_inlets = $('#heat_inlets');
var $heat_outlets = $('#heat_outlets');
var $coolant_cells = $('#coolant_cells');
var $reactor_platings = $('#reactor_platings');
var $particle_accelerators = $('#particle_accelerators');
var $parts = $('#parts');

var parts = [
	// Cells
	{
		id: 'uranium1',
		type: 'uranium',
		level: 1,
		title: 'Uranium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 10,
		base_ticks: 15,
		base_power: 1,
		base_heat: 1,
		cell_tick_upgrade_cost: 100,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 500,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 10000
	},
	{
		id: 'uranium2',
		type: 'uranium',
		level: 2,
		title: 'Dual Uranium Cell',
		base_description: multi_cell_description,
		category: 'cell',
		base_cost: 25,
		base_ticks: 15,
		base_power: 4,
		base_heat: 8
	},
	{
		id: 'uranium3',
		type: 'uranium',
		level: 3,
		title: 'Quad Uranium Cell',
		base_description: multi_cell_description,
		category: 'cell',
		base_cost: 60,
		base_ticks: 15,
		base_power: 12,
		base_heat: 36
	},
	{
		id: 'plutonium',
		type: 'plutonium',
		levels: 3,
		title: 'Plutonium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 6000,
		base_ticks: 60,
		base_power: 150,
		base_heat: 150,
		cell_tick_upgrade_cost: 30000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 30000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 6000000
	},
	{
		id: 'thorium',
		type: 'thorium',
		levels: 3,
		title: 'Thorium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 4700000,
		base_ticks: 900,
		base_power: 7400,
		base_heat: 7400,
		cell_tick_upgrade_cost: 25000000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 25000000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 4700000000
	},
	{
		id: 'seaborgium',
		type: 'seaborgium',
		levels: 3,
		title: 'Seaborgium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 4000000000,
		base_ticks: 3600,
		base_power: 1600000,
		base_heat: 1600000,
		cell_tick_upgrade_cost: 20000000000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 20000000000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 4000000000000
	},
	{
		id: 'dolorium',
		type: 'dolorium',
		levels: 3,
		title: 'Dolorium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 3900000000000,
		base_ticks: 22000,
		base_power: 230000000,
		base_heat: 230000000,
		cell_tick_upgrade_cost: 20000000000000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 20000000000000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 3900000000000000
	},
	{
		id: 'nefastium',
		type: 'nefastium',
		levels: 3,
		title: 'Nefastium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 3600000000000000,
		base_ticks: 86000,
		base_power: 52000000000,
		base_heat: 52000000000,
		cell_tick_upgrade_cost: 17500000000000000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 17500000000000000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 3600000000000000000
	},
	{
		id: 'protium',
		type: 'protium',
		levels: 3,
		title: 'Protium Cell',
		base_description: single_cell_description + ' After being fully depleted, protium cells permanently generate 10% more power per depleted cell.',
		category: 'cell',
		experimental: true,
		erequires: 'protium_cells',
		base_cost: 3000000000000000,
		base_ticks: 3600,
		base_power: 1250000000000,
		base_heat: 1250000000000
	},

	// Energy
	{
		id: 'reflector',
		type: 'reflector',
		title: 'Neutron Reflector',
		base_description: 'Increases adjacent cell power output by %power_increase% for %ticks total pulses.',
		levels: 5,
		category: 'reflector',
		level: 1,
		base_cost: 500,
		cost_multiplier: 50,
		base_power_increase: 1,
		power_increase_multiplier: 2,
		base_ticks: 100,
		ticks_multiplier: 2
	},
	{
		id: 'reflector6',
		type: 'reflector',
		title: 'Thermal Neutron Reflector',
		base_description: 'Increases adjacent cell power output by %power_increase% and heat output by %heat_increase% for %ticks total pulses.',
		category: 'reflector',
		experimental: true,
		erequires: 'heat_reflection',
		level: 6,
		base_cost: 100000000000000,
		base_power_increase: 32,
		base_heat_increase: 50,
		base_ticks: 3200
	},
	{
		id: 'capacitor',
		type: 'capacitor',
		title: 'Capacitor',
		base_description: 'Increases the maximum power of the reactor by %reactor_power. Holds a maximum of %containment heat.',
		levels: 5,
		category: 'capacitor',
		level: 1,
		base_cost: 1000,
		cost_multiplier: 160,
		base_reactor_power: 100,
		reactor_power_multiplier: 140,
		base_containment: 10,
		containment_multiplier: 5
	},
	{
		id: 'capacitor6',
		type: 'capacitor',
		title: 'Extreme Capacitor',
		base_description: 'Increases the maximum power of the reactor by %reactor_power. Holds a maximum of %containment heat. Heat is added to each unit equal to 50% of the power automatically sold by it.',
		category: 'capacitor',
		experimental: true,
		erequires: 'experimental_capacitance',
		level: 6,
		base_cost: 105000000000000,
		base_reactor_power: 2100000000000000,
		base_containment: 5400000000000
	},

	// Heat
	{
		id: 'vent',
		type: 'vent',
		title: 'Heat Vent',
		base_description: 'Lowers heat of itself by %vent per tick. Holds a maximum of %containment heat.',
		levels: 5,
		category: 'vent',
		level: 1,
		base_cost: 50,
		cost_multiplier: 250,
		base_containment: 80,
		containment_multiplier: 75,
		base_vent: 4,
		vent_multiplier: 75,
		location: 'cooling'
	},
	{
		id: 'vent6',
		type: 'vent',
		title: 'Extreme Vent',
		base_description: 'Lowers heat of itself by %vent per tick. Holds a maximum of %containment heat. Must consume power from the reactor at a rate of 100% of the heat removed from itself.',
		category: 'vent',
		experimental: true,
		erequires: 'vortex_cooling',
		level: 6,
		base_cost: 50000000000000,
		base_containment: 100000000000,
		base_vent: 5000000000,
	},
	{
		id: 'heat_exchanger',
		type: 'heat_exchanger',
		title: 'Heat Exchanger',
		base_description: 'Attempts to balance the heat between itself and adjacent components by percentage. Transfers up to %transfer heat per tick for each adjacent component. Holds up to %containment heat.',
		levels: 5,
		category: 'heat_exchanger',
		level: 1,
		base_cost: 160,
		cost_multiplier: 200,
		base_containment: 320,
		containment_multiplier: 75,
		base_transfer: 16,
		transfer_multiplier: 75,
		location: 'cooling'
	},
	{
		id: 'heat_exchanger6',
		type: 'heat_exchanger',
		title: 'Extreme Heat Exchanger',
		base_description: 'Attempts to balance the heat between itself, adjacent components and its entire row by percentage. Transfers up to %transfer heat per tick for each adjacent component. Holds up to %containment heat.',
		category: 'heat_exchanger',
		experimental: true,
		erequires: 'underground_heat_extraction',
		level: 6,
		base_cost: 50000000000000,
		base_containment: 1000000000000,
		base_transfer: 20000000000,
	},
	{
		id: 'heat_inlet',
		type: 'heat_inlet',
		title: 'Heat Inlet',
		base_description: 'Takes %transfer heat out of each adjacent component and puts it into the reactor each tick.',
		levels: 5,
		category: 'heat_inlet',
		level: 1,
		base_cost: 160,
		cost_multiplier: 200,
		base_transfer: 16,
		transfer_multiplier: 75,
		location: 'cooling'
	},
	{
		id: 'heat_inlet6',
		type: 'heat_inlet',
		title: 'Heat Inlet',
		base_description: 'Takes %transfer heat out of each adjacent component and puts it into the reactor each tick. Has a range of %range squares.',
		category: 'heat_inlet',
		experimental: true,
		erequires: 'vortex_extraction',
		base_range: 2,
		level: 6,
		base_cost: 50000000000000,
		base_transfer: 20000000000
	},
	{
		id: 'heat_outlet',
		type: 'heat_outlet',
		title: 'Heat Outlet',
		base_description: 'For each adjacent component %transfer is taken out of the reactor and put into the adjacent component.',
		levels: 5,
		category: 'heat_outlet',
		level: 1,
		base_cost: 160,
		cost_multiplier: 200,
		base_transfer: 16,
		transfer_multiplier: 75,
		location: 'cooling'
	},
	{
		id: 'heat_outlet6',
		type: 'heat_outlet',
		title: 'Extreme Heat Outlet',
		base_description: 'For each adjacent component %transfer is taken out of the reactor and put into the adjacent component. Has a range of %range squares.',
		category: 'heat_outlet',
		experimental: true,
		erequires: 'explosive_ejection',
		base_range: 2,
		level: 6,
		base_cost: 50000000000000,
		base_transfer: 20000000000
	},
	{
		id: 'coolant_cell',
		type: 'coolant_cell',
		title: 'Coolant Cell',
		base_description: 'Holds %containment heat before being destroyed.',
		levels: 5,
		category: 'coolant_cell',
		level: 1,
		base_cost: 500,
		cost_multiplier: 200,
		base_containment: 2000,
		containment_multiplier: 180,
		location: 'cooling'
	},
	{
		id: 'coolant_cell6',
		type: 'coolant_cell',
		title: 'Thermionic Coolant Cell',
		base_description: 'Holds %containment heat before being destroyed. 50% of the heat added to this part is instantly converted to power and added to the generator.',
		category: 'coolant_cell',
		experimental: true,
		erequires: 'thermionic_conversion',
		level: 6,
		base_cost: 160000000000000,
		base_containment: 380000000000000
	},
	{
		id: 'reactor_plating',
		type: 'reactor_plating',
		title: 'Reactor Plating',
		base_description: 'Increases maximum heat of the reactor by %reactor_heat.',
		levels: 5,
		category: 'reactor_plating',
		level: 1,
		base_cost: 1000,
		cost_multiplier: 160,
		base_reactor_heat: 100,
		reactor_heat_multiplier: 140,
		location: 'cooling'
	},
	{
		id: 'reactor_plating6',
		type: 'reactor_plating',
		title: 'Charged Reactor Plating',
		base_description: 'Increases maximum heat and power of the reactor by %reactor_heat.',
		category: 'reactor_plating',
		experimental: true,
		erequires: 'micro_capacitance',
		level: 6,
		base_cost: 100000000000000,
		base_reactor_heat: 8000000000000
	},
	{
		id: 'particle_accelerator',
		type: 'particle_accelerator',
		title: 'Particle Accelerator',
		base_description: 'Generates Exotic Particles based on heat passing through the accelerator (maximum %ep_heat). If this part explodes it causes instant reactor meltdown. Holds a maximum of %containment heat.',
		levels: 5,
		category: 'particle_accelerator',
		level: 1,
		base_cost: 1000000000000,
		cost_multiplier: 10000,
		base_containment: 100,
		containment_multiplier: 1000000,
		base_ep_heat: 500000000,
		ep_heat_multiplier: 20000,
		location: 'cooling'
	}
];

var locked_find = /[\b\s]locked\b/;
var Part = function(part) {
	this.className = 'part_' + part.id;
	this.$el = document.createElement('BUTTON');
	this.$el.className = 'part locked ' + this.className;
	this.$el.part = this;

	this.part = part;
	this.id = part.id;
	this.category = part.category;
	this.heat = part.base_heat;
	this.power = part.base_power;
	this.heat_multiplier = part.base_heat_multiplier;
	this.power_multiplier = part.base_power_multiplier;
	this.power_increase = part.base_power_increase;
	this.heat_increase = part.base_heat_increase;
	this.ticks = part.base_ticks;
	this.containment = part.base_containment;
	this.vent = part.base_vent;
	this.reactor_power = part.base_reactor_power;
	this.reactor_heat = part.base_reactor_heat;
	this.transfer = part.base_transfer;
	this.range = part.base_range;
	this.ep_heat = part.base_ep_heat;
	this.erequires = part.erequires || null;
	this.cost = part.base_cost;
	this.affordable = true;
	this.perpetual = false;
	this.description = '';
	this.sells = 0;
	this.auto_sell = 0;

	var $image = $('<div class="image">');
	$image.innerHTML = 'Click to Select';

	this.$el.appendChild($image);
};

Part.prototype.updateDescription = function(tile) {
	var description = this.part.base_description
		.replace(/%power_increase/, fmt(this.power_increase))
		.replace(/%heat_increase/, fmt(this.heat_increase))
		.replace(/%reactor_power/, fmt(this.reactor_power))
		.replace(/%reactor_heat/, fmt(this.reactor_heat))
		.replace(/%ticks/, fmt(this.ticks))
		.replace(/%containment/, fmt(this.containment))
		.replace(/%ep_heat/, fmt(this.ep_heat))
		.replace(/%range/, fmt(this.range))
		.replace(/%count/, [1, 2, 4][this.part.level - 1])
		;

	if ( tile ) {
		description = description
			.replace(/%transfer/, fmt(this.transfer * (1 + transfer_multiplier / 100)))
			.replace(/%vent/, fmt(this.vent * (1 + vent_multiplier / 100) ))
			.replace(/%power/, fmt(tile.display_power))
			.replace(/%heat/, fmt(tile.display_heat))
			;
	} else {
		description = description
			.replace(/%transfer/, fmt(this.transfer))
			.replace(/%vent/, fmt(this.vent))
			.replace(/%power/, fmt(this.power))
			.replace(/%heat/, fmt(this.heat))
			;
	}

	if ( this.part.level > 1 ) {
		description = description.replace(/%type/, part_objects[this.part.type + 1].part.title);
	}

	this.description = description;
};

Part.prototype.showTooltip = function(tile) {
	$tooltip_name.innerHTML = this.part.title;

	if ( tile ) {
		this.updateDescription(tile);
		$tooltip_cost.style.display = 'none';
		$tooltip_sells.style.display = null;

		$tooltip_delete.style.display = null;

		if ( tile.activated && tile.part.containment ) {
			$tooltip_heat_wrapper.style.display = null;
		} else {
			$tooltip_heat_wrapper.style.display = 'none';
		}

		if ( tile.activated && tile.part.ticks ) {
			$tooltip_ticks_wrapper.style.display = null;
		} else {
			$tooltip_ticks_wrapper.style.display = 'none';
		}
	} else {
		$tooltip_delete.style.display = 'none';

		this.updateDescription();
		$tooltip_cost.style.display = null;
		$tooltip_sells.style.display = 'none';

		$tooltip_heat_wrapper.style.display = 'none';
		$tooltip_ticks_wrapper.style.display = 'none';
	}

	$tooltip_heat_per.style.display = 'none';
	$tooltip_power_per.style.display = 'none';

	this.updateTooltip(tile);
};

Part.prototype.updateTooltip = function(tile) {
	if ( tile ) {
		if ( $tooltip_description.innerHTML !== tile.part.description ) {
			$tooltip_description.innerHTML = tile.part.description;
		}

		if ( tile.activated && tile.part.containment ) {
			$tooltip_heat.innerHTML = fmt(tile.heat_contained);
			$tooltip_max_heat.innerHTML = fmt(tile.part.containment);
		}

		if ( tile.activated && tile.part.ticks ) {
			$tooltip_ticks.innerHTML = fmt(tile.ticks);
			$tooltip_max_ticks.innerHTML = fmt(tile.part.ticks);
		}
	} else {
		$tooltip_description.innerHTML = this.description;

		if ( this.erequires && !upgrade_objects[this.erequires].level ) {
			$tooltip_cost.innerHTML = 'LOCKED';
		} else {
			$tooltip_cost.innerHTML = fmt(this.cost);
		}
	}
};

var part_obj;
var part_settings;
var part;
var part_objects = {};
var part_objects_array = [];
var cell_prefixes = ['', 'Dual ', 'Quad '];
var prefixes = ['Basic ', 'Advanced ', 'Super ', 'Wonderous ', 'Ultimate '];
var cell_power_multipliers = [1, 4, 12];
var cell_heat_multipliers = [1, 8, 36];

var create_part = function(part, level) {
	if ( level ) {
		part = JSON.parse(JSON.stringify(part));
		part.level = level;

		if ( part.category === 'cell' ) {
			part.id = part.type + level;
			part.title = cell_prefixes[level -1] + part.title;
			part.base_cost = part.base_cost
			if ( level > 1 ) {
				part.base_cost *= Math.pow(2.2, level - 1);
				part.base_description = multi_cell_description;
			}
			part.base_power = part.base_power * cell_power_multipliers[level - 1];
			part.base_heat = part.base_heat * cell_heat_multipliers[level - 1];
		} else {
			part.id = part.category + level;
			part.title = prefixes[level -1] + part.title;
			part.base_cost = part.base_cost * Math.pow(part.cost_multiplier, level -1);

			if ( part.base_ticks && part.ticks_multiplier ) {
				part.base_ticks = part.base_ticks * Math.pow(part.ticks_multiplier, level - 1);
			}

			if ( part.base_containment && part.containment_multiplier ) {
				part.base_containment = part.base_containment * Math.pow(part.containment_multiplier, level - 1);
			}

			if ( part.base_reactor_power && part.reactor_power_multiplier ) {
				part.base_reactor_power = part.base_reactor_power * Math.pow(part.reactor_power_multiplier, level - 1);
			}

			if ( part.base_reactor_heat && part.reactor_heat_multiplier ) {
				part.base_reactor_heat = part.base_reactor_heat * Math.pow(part.reactor_heat_multiplier, level - 1);
			}

			if ( part.base_transfer && part.transfer_multiplier ) {
				part.base_transfer = part.base_transfer * Math.pow(part.transfer_multiplier, level - 1);
			}

			if ( part.base_vent && part.vent_multiplier ) {
				part.base_vent = part.base_vent * Math.pow(part.vent_multiplier, level - 1);
			}

			if ( part.base_ep_heat && part.ep_heat_multiplier ) {
				part.base_ep_heat = part.base_ep_heat * Math.pow(part.ep_heat_multiplier, level - 1);
			}

			if ( part.base_power_increase && part.power_increase_multiplier ) {
				part.base_power_increase = part.base_power_increase * Math.pow(part.power_increase_multiplier, level - 1);
			}

			if ( part.base_heat_increase ) {
				part.base_heat_increase = part.base_heat_increase;
			}

		}
	}

	part_obj = new Part(part);

	part_objects[part.id] = part_obj;
	part_objects_array.push(part_obj);

	part_obj.updateDescription();

	if ( part.category === 'cell' ) {
		$cells.appendChild(part_obj.$el);
	} else if ( part.category === 'reflector' ) {
		$reflectors.appendChild(part_obj.$el);
	} else if ( part.category === 'capacitor' ) {
		$capacitors.appendChild(part_obj.$el);
	} else if ( part.category === 'vent' ) {
		$vents.appendChild(part_obj.$el);
	} else if ( part.category === 'heat_exchanger' ) {
		$heat_exchangers.appendChild(part_obj.$el);
	} else if ( part.category === 'heat_inlet' ) {
		$heat_inlets.appendChild(part_obj.$el);
	} else if ( part.category === 'heat_outlet' ) {
		$heat_outlets.appendChild(part_obj.$el);
	} else if ( part.category === 'coolant_cell' ) {
		$coolant_cells.appendChild(part_obj.$el);
	} else if ( part.category === 'reactor_plating' ) {
		$reactor_platings.appendChild(part_obj.$el);
	} else if ( part.category === 'particle_accelerator' ) {
		$particle_accelerators.appendChild(part_obj.$el);
	}

	return part_obj;
}

for ( pi = 0, pl = parts.length; pi < pl; pi++ ) {
	part_settings = parts[pi];
	if ( part_settings.levels ) {
		for ( i = 0, l = part_settings.levels; i < l; i++ ) {
			create_part(part_settings, i + 1);
		}
	} else {
		create_part(part_settings);
	}
}

// Part tooltips
var tooltip_showing_replace = /[\s\b]tooltip_showing\b/;
var tooltip_showing = false;
var tooltip_update = null;
var tooltip_part;

var part_tooltip_update = function() {
	tooltip_part.updateTooltip();
}

var part_tooltip_show = function(e) {
	var part = this.part;

	if ( !tooltip_showing ) {
		$main.className += ' tooltip_showing';
	}

	part.showTooltip();
	tooltip_showing = true;
	tooltip_part = part;
	tooltip_update = part_tooltip_update;
};

var part_tooltip_hide = function(e) {
	tooltip_showing = false;
	tooltip_update = null;
	tooltip_part = null;
	$main.className = $main.className.replace(tooltip_showing_replace, '');

};

if ( !is_ios ) {
	$all_parts.delegate('part', 'mouseover', part_tooltip_show);
	$all_parts.delegate('part', 'mouseout', part_tooltip_hide);
} else {
	$all_parts.delegate('part', 'touchend', part_tooltip_show);
}

$all_parts.delegate('part', 'focus', part_tooltip_show);
$all_parts.delegate('part', 'blur', part_tooltip_hide);

  /////////////////////////////
 // Reduce Heat Manually
/////////////////////////////

var $reduce_heat = $('#reduce_heat');
var $manual_heat_reduce = $('#manual_heat_reduce');
var $auto_heat_reduce = $('#auto_heat_reduce');

$reduce_heat.onclick = function() {
	current_heat -= manual_heat_reduce;

	if ( current_heat < 0 ) {
		current_heat = 0;
	}

	$current_heat.innerHTML = fmt(current_heat);
};

var set_manual_heat_reduce = function() {
	$manual_heat_reduce.innerHTML = '-' + fmt(manual_heat_reduce);
};

var set_auto_heat_reduce = function() {
	$auto_heat_reduce.innerHTML = '-' + (fmt(max_heat/10000));
};

  /////////////////////////////
 // Upgrades
/////////////////////////////

var epart_onclick = function(upgrade) {
	var eparts_count = 0;

	for ( var i = 0, l = upgrade_objects_array.length; i < l; i++) {
		if ( upgrade_objects_array[i].upgrade.type === 'experimental_parts' && upgrade_objects_array[i].level ) {
			eparts_count++;
		}
	}

	for ( var i = 0, l = upgrade_objects_array.length; i < l; i++) {
		if ( upgrade_objects_array[i].upgrade.type === 'experimental_parts' && !upgrade_objects_array[i].level ) {
			upgrade_objects_array[i].ecost = upgrade_objects_array[i].upgrade.ecost * (eparts_count + 1);
			// TODO: Maybe find a better way to do this
			upgrade_objects_array[i].display_cost = fmt(upgrade_objects_array[i].ecost);
		}
	}
};

var upgrades = [
	{
		id: 'chronometer',
		type: 'other',
		title: 'Improved Chronometers',
		description: '+1 tick per second per level of upgrade.',
		cost: 10000,
		multiplier: 100,
		onclick: function(upgrade) {
			loop_wait = base_loop_wait / ( upgrade.level + 1 );
		}
	},
	{
		id: 'forceful_fusion',
		type: 'other',
		title: 'Forceful Fusion',
		description: 'Cells produce 1% more power at 1k heat, 2% power at 2m heat etc. per level of upgrade.',
		cost: 10000,
		multiplier: 100,
		onclick: function(upgrade) {
			heat_power_multiplier = upgrade.level;
		}
	},
	{
		id: 'heat_control_operator',
		type: 'other',
		title: 'Heat Control Operator',
		description: 'When below maximum heat, reactor stays at a constant temperature.',
		// TODO: Figure out a good price for this
		cost: 10000000000000000000,
		levels: 1,
		onclick: function(upgrade) {
			heat_controlled = upgrade.level;
		}
	},
	{
		id: 'improved_piping',
		type: 'other',
		title: 'Improved Piping',
		description: 'Venting manually is 10x as effective per level of upgrade.',
		cost: 100,
		multiplier: 20,
		onclick: function(upgrade) {
			manual_heat_reduce = base_manual_heat_reduce * Math.pow(10, upgrade.level);
			set_manual_heat_reduce();
		}
	},
	{
		id: 'improved_alloys',
		type: 'other',
		title: 'Improved Alloys',
		description: 'Plating holds 100% more heat per level of upgrade.',
		cost: 5000,
		multiplier: 5,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['reactor_plating' + i];
				part.reactor_heat = part.part.base_reactor_heat * ( upgrade.level + 1 ) * Math.pow(2, upgrade_objects['quantum_buffering'].level);
				part.updateDescription();
			}
		}
	},

	// Capacitors
	{
		id: 'improved_power_lines',
		type: 'other',
		title: 'Improved Power Lines',
		description: 'Sells 1% of your power each tick per level of upgrade.',
		cost: 100,
		multiplier: 10,
		onclick: function(upgrade) {
			auto_sell_multiplier = .01 * upgrade.level;
		}
	},
	{
		id: 'improved_wiring',
		type: 'other',
		title: 'Improved Wiring',
		description: 'Capacitors hold +100% power and heat per level of upgrade.',
		cost: 5000,
		multiplier: 5,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['capacitor' + i];
				part.reactor_power = part.part.base_reactor_power * ( upgrade.level + 1 ) * Math.pow(2, upgrade_objects['quantum_buffering'].level);
				part.containment = part.part.base_containment * ( upgrade.level + 1 ) * Math.pow(2, upgrade_objects['quantum_buffering'].level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'perpetual_capacitors',
		type: 'other',
		title: 'Perpetual Capacitors',
		description: 'If capacitors are on a cool surface when they go over their maximum heat containment, the heat is vented directly into the reactor and the capacitor is replaced. The capacitor costs 10 times the normal cost.',
		cost: 1000000000000000000,
		multiplier: 5,
		levels: 1,
		onclick: function(upgrade) {
			/* TODO: ponder this - it's part-wide so it's basically just a setting
			var part;
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['capacitor' + i];
				part.perpetual = upgrade.level > 0 ? true : false;
				part.updateDescription();
			}*/
		}
	},
	{
		id: 'improved_coolant_cells',
		type: 'other',
		title: 'Improved Coolant Cells',
		description: 'Coolant cells hold 100% more heat per level of upgrade.',
		cost: 5000,
		multiplier: 100,
		onclick: function(upgrade) {
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['coolant_cell' + i];
				part.containment = part.part.base_containment * ( upgrade.level + 1 ) * Math.pow(2, upgrade_objects['ultracryonics'].level);
				part.updateDescription();
			}
		}
	},

	// Reflectors
	{
		id: 'improved_reflector_density',
		type: 'other',
		title: 'Improved Reflector Density',
		description: 'Reflectors last 100% longer per level of upgrade.',
		cost: 5000,
		multiplier: 100,
		onclick: function(upgrade) {
			// TODO: 6
			var part;
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['reflector' + i];
				part.ticks = part.part.base_ticks * ( upgrade.level + 1 );
				part.updateDescription();
			}
		}
	},
	{
		id: 'improved_neutron_reflection',
		type: 'other',
		title: 'Improved Neutron Reflection',
		description: 'Reflectors generate an additional 1% power per level of upgrade.',
		cost: 5000,
		multiplier: 100,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['reflector' + i];
				part.power_increase = part.part.base_power_increase * (1 + (upgrade.level / 100)) * Math.pow(2, upgrade_objects['full_spectrum_reflectors'].level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'perpetual_reflectors',
		type: 'other',
		title: 'Perpetual Reflectors',
		description: 'Reflectors are automtically replaced after being destroyed if they are on a cool surface. The replacement part will cost 1.5 times the normal cost.',
		cost: 10000000000000000000,
		levels: 1,
		onclick: function(upgrade) {
			// TODO: 6
			var part;
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['reflector' + i];
				part.perpetual = upgrade.level ? true : false;
				part.updateDescription();
			}
		}
	},

	// Exchangers
	{
		id: 'improved_heat_exchangers',
		type: 'exchangers',
		title: 'Improved Heat Exchangers',
		description: 'Heat Exchangers, Inlets and Outlets hold and exchange 100% more heat per level of upgrade',
		cost: 600,
		multiplier: 100,
		onclick: function(upgrade) {
			var part;

			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['heat_inlet' + i];
				part.transfer = part.part.base_transfer * (upgrade.level + 1) * Math.pow(2, upgrade_objects['fluid_hyperdynamics'].level);
				part.updateDescription();

				part = part_objects['heat_outlet' + i];
				part.transfer = part.part.base_transfer * (upgrade.level + 1) * Math.pow(2, upgrade_objects['fluid_hyperdynamics'].level);
				part.updateDescription();

				part = part_objects['heat_exchanger' + i];
				part.transfer = part.part.base_transfer * ( upgrade.level + 1 ) * Math.pow(2, upgrade_objects['fluid_hyperdynamics'].level);
				part.containment = part.part.base_containment * (upgrade.level + 1) * Math.pow(2, upgrade_objects['fractal_piping'].level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'reinforced_heat_exchangers',
		type: 'exchangers',
		title: 'Reinforced Heat Exchangers',
		description: 'Each plating increases the amout of heat that exchangers can exchange by 1% per level of upgrade per level of plating.',
		cost: 1000,
		multiplier: 100,
		onclick: function(upgrade) {
			transfer_plating_multiplier = upgrade.level;
		}
	},
	{
		id: 'active_exchangers',
		type: 'exchangers',
		title: 'Active Exchangers',
		description: 'Each capacitor increases the amout of heat that exchangers can exchange by 1% per level of upgrade per level of capacitor.',
		cost: 1000,
		multiplier: 100,
		onclick: function(upgrade) {
			transfer_capacitor_multiplier = upgrade.level;
		}
	},

	// Vents
	{
		id: 'improved_heat_vents',
		type: 'vents',
		title: 'Improved Heat Vents',
		description: 'Vents hold and vent 100% more heat per level of upgrade.',
		cost: 250,
		multiplier: 100,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['vent' + i];
				part.vent = part.part.base_vent * (upgrade.level + 1) * Math.pow(2, upgrade_objects['fluid_hyperdynamics'].level);
				part.containment = part.part.base_containment * (upgrade.level + 1) * Math.pow(2, upgrade_objects['fractal_piping'].level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'improved_heatsinks',
		type: 'vents',
		title: 'Improved Heatsinks',
		description: 'Each plating increases the amount of heat that vents can vent by 1% per level of upgrade per level of plating.',
		cost: 1000,
		multiplier: 100,
		onclick: function(upgrade) {
			vent_plating_multiplier = upgrade.level;
		}
	},
	{
		id: 'active_venting',
		type: 'vents',
		title: 'Active Venting',
		description: 'Each capacitor increases the effectiveness of heat that vents can vent by 1% per level of upgrade per level of capacitor.',
		cost: 1000,
		multiplier: 100,
		onclick: function(upgrade) {
			vent_capacitor_multiplier = upgrade.level;
		}
	},
	{
		id: 'improved_particle_accelerators',
		type: 'other',
		title: 'Improved Particle Accelerators',
		description: 'Increase the maximum heat the Particle Accelerators can use to create Exotic Particles by 100% per level of upgrade.',
		cost: 1000000000000000,
		multiplier: 100,
		onclick: function(upgrade) {
			var part;
			// TODO: 6
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['particle_accelerator' + i];
				part.ep_heat = part.part.base_ep_heat * (upgrade.level + 1) * Math.pow(2, upgrade_objects['force_particle_research'].level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'expand_reactor_rows',
		type: 'other',
		title: 'Expand Reactor Rows',
		description: 'Add one row to the reactor for each level of the upgrade.',
		cost: 800,
		multiplier: 100,
		onclick: function(upgrade) {
			rows = base_rows + upgrade.level;
		}
	},
	{
		id: 'expand_reactor_cols',
		type: 'other',
		title: 'Expand Reactor Cols',
		description: 'Add one column to the reactor for each level of the upgrade.',
		cost: 800,
		multiplier: 100,
		onclick: function(upgrade) {
			cols = base_cols + upgrade.level;
		}
	},

  /////////////////////////////
 // Experimental Upgrades
/////////////////////////////

	{
		id: 'laboratory',
		type: 'experimental_laboratory',
		title: 'Laboratory',
		description: 'Enables experimental upgrades.',
		ecost: 1,
		levels: 1,
		onclick: function(upgrade) {
			// Nothing, used to unlock other upgrades
		}
	},
	{
		id: 'infused_cells',
		type: 'experimental_boost',
		title: 'Infused Cells',
		description: 'Each fuel cell produces an additional 100% base power per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
			var part;
			for ( var i = 0, l = part_objects_array.length; i < l; i++ ) {
				part = part_objects_array[i];

				if ( part.category === 'cell' ) {
					if ( upgrade_objects['cell_power_' + part.part.type] ) {
						part.power = part.part.base_power * (upgrade_objects['cell_power_' + part.part.type].level + upgrade.level + 1) * Math.pow(2, upgrade_objects['unleashed_cells'].level);
					} else {
						part.power = part.part.base_power * (upgrade.level + 1) * Math.pow(2, upgrade_objects['unleashed_cells'].level);
					}
				}
			}
		}
	},
	{
		id: 'unleashed_cells',
		type: 'experimental_boost',
		title: 'Unleashed Cells',
		description: 'Each fuel cell produces two times their base heat and power per level of upgrade.',
		erequires: 'laboratory',
		ecost: 100,
		multiplier: 2,
		onclick: function(upgrade) {
			var part;
			for ( var i = 0, l = part_objects_array.length; i < l; i++ ) {
				part = part_objects_array[i];
				if ( part.category === 'cell' ) {
					if ( upgrade_objects['cell_power_' + part.part.type] ) {
						part.power = part.part.base_power * (upgrade_objects['cell_power_' + part.part.type].level + upgrade_objects['infused_cells'].level + 1) * Math.pow(2, upgrade.level);
					} else {
						part.power = part.part.base_power * (upgrade_objects['infused_cells'].level + 1) * Math.pow(2, upgrade.level);
					}

					part.heat = part.part.base_heat * Math.pow(2, upgrade.level);
				}
			}
		}
	},
	{
		id: 'quantum_buffering',
		type: 'experimental_boost',
		title: 'Quantum Buffering',
		description: 'Capacitors and platings provide twice as much reactor power and heat capacity, and capacitors can contain twice as much heat per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['capacitor' + i];
				part.reactor_power = part.part.base_reactor_power * (upgrade_objects['improved_wiring'].level + 1) * Math.pow(2, upgrade.level);
				part.containment = part.part.base_containment * (upgrade_objects['improved_wiring'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();

				part = part_objects['reactor_plating' + i];
				part.reactor_heat = part.part.base_reactor_heat * (upgrade_objects['improved_alloys'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'full_spectrum_reflectors',
		type: 'experimental_boost',
		title: 'Full Spectrum Reflectors',
		description: 'Reflectors are twice as effective per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['reflector' + i];
				part.power_increase = part.part.base_power_increase * (1 + (upgrade_objects['improved_neutron_reflection'].level / 100)) * Math.pow(2, upgrade.level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'fluid_hyperdynamics',
		type: 'experimental_boost',
		title: 'Fluid Hyperdynamics',
		description: 'Heat vents, exchangers, inlets and outlets are two times as effective per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
			var part;

			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['heat_inlet' + i];
				part.transfer = part.part.base_transfer * (upgrade_objects['improved_heat_exchangers'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();

				part = part_objects['heat_outlet' + i];
				part.transfer = part.part.base_transfer * (upgrade_objects['improved_heat_vents'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();

				part = part_objects['heat_exchanger' + i];
				part.transfer = part.part.base_transfer * (upgrade_objects['improved_heat_exchangers'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();

				part = part_objects['vent' + i];
				part.vent = part.part.base_vent * (upgrade_objects['improved_heat_exchangers'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'fractal_piping',
		type: 'experimental_boost',
		title: 'Fractal Piping',
		description: 'Heat vents and exchangers hold two times their base heat per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
			var part;

			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['vent' + i];
				part.containment = part.part.base_containment * (upgrade_objects['improved_heat_vents'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();

				part = part_objects['heat_exchanger' + i];
				part.containment = part.part.base_containment * (upgrade_objects['improved_heat_exchangers'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'ultracryonics',
		type: 'experimental_boost',
		title: 'Ultracryonics',
		description: 'Coolant cells hold two times their base heat per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
			for ( var i = 1; i <= 6; i++ ) {
				part = part_objects['coolant_cell' + i];
				part.containment = part.part.base_containment * ( upgrade_objects['improved_coolant_cells'].level + 1 ) * Math.pow(2, upgrade.level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'phlembotinum_core',
		type: 'experimental_boost',
		title: 'Phlembotinum Core',
		description: 'Increase the base heat and power storage of the reactor by four times per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
			altered_max_power = base_max_power * Math.pow(4, upgrade.level);
			altered_max_heat = base_max_heat * Math.pow(4, upgrade.level);
		}
	},
	{
		id: 'force_particle_research',
		type: 'experimental_boost',
		title: 'Force Particle Research',
		description: 'Increase the maximum heat Particle Accelerators can use to create Exotic Particles by two times per level of upgrade.',
		erequires: 'laboratory',
		ecost: 500,
		multiplier: 2,
		onclick: function(upgrade) {
			var part;
			// TODO: 6
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['particle_accelerator' + i];
				part.ep_heat = part.part.base_ep_heat * (upgrade_objects['improved_particle_accelerators'].level + 1) * Math.pow(2, upgrade.level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'protium_cells',
		type: 'experimental_cells',
		title: 'Protium Cells',
		description: 'Allows you to use protium cells.',
		erequires: 'laboratory',
		ecost: 50,
		levels: 1,
		onclick: function(upgrade) {
			// Nothing, just required for placing parts
		}
	},
	{
		id: 'unstable_protium',
		type: 'experimental_cells_boost',
		title: 'Unstable Protium',
		description: 'Protium cells last half as long and product twice as much power and heat per level.',
		erequires: 'protium_cells',
		ecost: 500,
		multiplier: 2,
		onclick: function(upgrade) {
			for ( var i = 1; i <= 3; i++ ) {
				part = part_objects['protium' + i];
				part.heat = part.part.base_heat * Math.pow(2, upgrade.level) * Math.pow(2, upgrade_objects['unleashed_cells'].level);
				part.power = part.part.base_power * (upgrade_objects['infused_cells'].level + 1) * Math.pow(2, upgrade.level) * Math.pow(2, upgrade_objects['unleashed_cells'].level);
				part.ticks = part.part.base_ticks / Math.pow(2, upgrade.level);
				part.updateDescription();
			}
		}
	},
	{
		id: 'heat_reflection',
		type: 'experimental_parts',
		title: 'Heat Reflection',
		description: 'Allows you to use Thermal Neutron Reflectors. When purchased, the EP cost of other parts goes up.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
			epart_onclick(upgrade);
		}
	},
	{
		id: 'experimental_capacitance',
		type: 'experimental_parts',
		title: 'Experimental Capacitance',
		description: 'Allows you to use Extreme Capacitors. When purchased, the EP cost of other parts goes up.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
			epart_onclick(upgrade);
		}
	},
	{
		id: 'vortex_cooling',
		type: 'experimental_parts',
		title: 'Vortex Cooling',
		description: 'Allows you to use Extreme Vents. When purchased, the EP cost of other parts goes up.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
			epart_onclick(upgrade);
		}
	},
	{
		id: 'underground_heat_extraction',
		type: 'experimental_parts',
		title: 'Underground Heat Extraction',
		description: 'Allows you to use Extreme Heat Exchangers. When purchased, the EP cost of other parts goes up.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
			epart_onclick(upgrade);
		}
	},
	{
		id: 'vortex_extraction',
		type: 'experimental_parts',
		title: 'Vortex Extraction',
		description: 'Allows you to use Extreme Heat Inlets. When purchased, the EP cost of other parts goes up.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
			epart_onclick(upgrade);
		}
	},
	{
		id: 'explosive_ejection',
		type: 'experimental_parts',
		title: 'Explosive Ejection',
		description: 'Allows you to use Extreme Heat Outlets. When purchased, the EP cost of other parts goes up.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
			epart_onclick(upgrade);
		}
	},
	{
		id: 'thermionic_conversion',
		type: 'experimental_parts',
		title: 'Thermionic Conversion',
		description: 'Allows you to use Thermionic Coolant Cells. When purchased, the EP cost of other parts goes up.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
			epart_onclick(upgrade);
		}
	},
	{
		id: 'micro_capacitance',
		type: 'experimental_parts',
		title: 'Micro Capacitance',
		description: 'Allows you to use Charged Reactor Plating. When purchased, the EP cost of other parts goes up.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
			epart_onclick(upgrade);
		}
	}

];

var Upgrade = function(upgrade) {
	var me = this;
	this.max_level = upgrade.levels || upgrade_max_level;
	this.upgrade = upgrade;
	this.level = 0;
	this.cost = 0;
	this.part = upgrade.part || null;
	this.erequires = upgrade.erequires || null;
	this.ecost = upgrade.ecost || 0;
	this.affordable = true;
	this.$el = $('<button class="upgrade">');
	this.$el.id = upgrade.id;
	this.$el.upgrade = upgrade;

	this.display_cost = '';

	var $image = $('<div class="image">');
	$image.innerHTML = 'Click to Upgrade';

	this.$levels = $('<span class="levels">');

	$image.appendChild(this.$levels);

	this.$el.appendChild($image);
};

Upgrade.prototype.setLevel = function(level) {
	this.level = level;
	this.$levels.innerHTML = level;

	if ( this.ecost ) {
		if ( this.upgrade.multiplier ) {
			this.ecost = this.upgrade.ecost * Math.pow(this.upgrade.multiplier, this.level);
		} else {
			this.ecost = this.upgrade.ecost;
		}

		if ( this.level >= this.max_level ) {
			this.display_cost = '--';
		} else {
			this.display_cost = fmt(this.ecost);
		}
	} else {
		this.cost = this.upgrade.cost * Math.pow(this.upgrade.multiplier, this.level);

		if ( this.level >= this.max_level ) {
			this.display_cost = '--';
		} else {
			this.display_cost = fmt(this.cost);
		}
	}

	this.upgrade.onclick(this);

	if ( tooltip_showing ) {
		this.updateTooltip();
	}
}

Upgrade.prototype.showTooltip = function() {
	$tooltip_name.innerHTML = this.upgrade.title;

	$tooltip_cost.style.display = null;
	$tooltip_sells.style.display = 'none';
	$tooltip_heat_per.style.display = 'none';
	$tooltip_power_per.style.display = 'none';
	$tooltip_heat_wrapper.style.display = 'none';
	$tooltip_delete.style.display = 'none';

	this.updateTooltip();
};

Upgrade.prototype.updateTooltip = function(tile) {
	$tooltip_description.innerHTML = this.upgrade.description;

	if ( this.ecost ) {
		$tooltip_cost.innerHTML = this.display_cost + ' EP';
	} else {
		$tooltip_cost.innerHTML = this.display_cost;
	}
};

// Upgrade tooltips
// TODO: DRY this
var tooltip_upgrade = null;
var upgrade_tooltip_show = function(e) {
	var upgrade = this.upgrade;

	upgrade.showTooltip();
	if ( !tooltip_showing ) {
		$main.className += ' tooltip_showing';
	}

	tooltip_showing = true;
	tooltip_upgrade = upgrade;
	//tooltip_update = upgrade.updateTooltip;
};

var upgrade_tooltip_hide = function(e) {
	tooltip_showing = false;
	tooltip_upgrade = null;
	//tooltip_update = null;
	$main.className = $main.className.replace(tooltip_showing_replace, '');
};

if ( !is_ios ) {
	$all_upgrades.delegate('upgrade', 'mouseover', upgrade_tooltip_show);
	$all_upgrades.delegate('upgrade', 'mouseout', upgrade_tooltip_hide);
} else {
	$all_upgrades.delegate('upgrade', 'touchend', upgrade_tooltip_show);
}

$all_upgrades.delegate('upgrade', 'focus', upgrade_tooltip_show);
$all_upgrades.delegate('upgrade', 'blur', upgrade_tooltip_hide);

// More stuff I guess

var upgrade_locations = {
	cell_tick_upgrades: $('#cell_tick_upgrades'),
	cell_power_upgrades: $('#cell_power_upgrades'),
	cell_perpetual_upgrades: $('#cell_perpetual_upgrades'),
	other: $('#other_upgrades'),
	vents: $('#vent_upgrades'),
	exchangers: $('#exchanger_upgrades'),
	experimental_laboratory: $('#experimental_laboratory'),
	experimental_boost: $('#experimental_boost'),
	experimental_cells: $('#experimental_cells'),
	experimental_cells_boost: $('#experimental_cell_boost'),
	experimental_parts: $('#experimental_parts')
};

var upgrade_objects = {};
var upgrade_objects_array = [];
var create_upgrade = function(u) {
	u.levels = u.levels || upgrade_max_level;
	var upgrade = new Upgrade(u);
	upgrade.$el.upgrade = upgrade;

	if ( u.className ) {
		upgrade.$el.className += ' ' + u.className;
	}

	upgrade_locations[u.type].appendChild(upgrade.$el);
	upgrade_objects_array.push(upgrade);
	upgrade_objects[upgrade.upgrade.id] = upgrade;
};

var types = [
	{
		type: 'cell_power',
		title: 'Potent ',
		description: ' cells produce 100% more power per level of upgrade.',
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 3; i++ ) {
				part = part_objects[upgrade.part.type + i];
				part.power = (
					part.part.base_power * (upgrade.level + 1)
					+ part.part.base_power * (upgrade_objects['infused_cells'].level + 1)
				) * Math.pow(2, upgrade_objects['unleashed_cells'].level);
				part.updateDescription();
			}
		}
	},
	{
		type: 'cell_tick',
		title: 'Enriched ',
		description: ' cells last twice as long per level of upgrade.',
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 3; i++ ) {
				part = part_objects[upgrade.part.type + i];
				part.ticks = part.part.base_ticks * Math.pow(2, upgrade.level);
				part.updateDescription();
			}
		}
	},
	{
		type: 'cell_perpetual',
		title: 'Perpetual ',
		description: ' cells are automatically replaced when they become depleted. The replacement cell will cost 1.5 times the normal cost.',
		levels: 1,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 3; i++ ) {
				part = part_objects[upgrade.part.type + i];
				if ( upgrade.level ) {
					part.perpetual = true;
				} else {
					part.perpetual = false;
				}
				part.updateDescription();
			}
		}
	}
];

var type;
var part;

for ( var i = 0, l = types.length; i < l; i++ ) {
	type = types[i];

	for ( var pi = 0, pl = parts.length; pi < pl; pi++ ) {
		part = parts[pi];

		if ( part.cell_tick_upgrade_cost ) {
			upgrade = {
				id: type.type + '_' + part.type,
				type: type.type + '_upgrades',
				title: type.title + ' ' + part.title,
				description: part.title + ' ' + type.description,
				levels: type.levels,
				cost: part[type.type + '_upgrade_cost'],
				multiplier: part[type.type + '_upgrade_multiplier'],
				onclick: type.onclick,
				className: part.type + ' ' + type.type,
				part: part
			};

			create_upgrade(upgrade);
		}
	}
}

for ( var i = 0, l = upgrades.length; i < l; i++ ) {
	create_upgrade(upgrades[i]);
}

for ( var i = 0, l = upgrade_objects_array.length; i < l; i++ ) {
	upgrade_objects_array[i].setLevel(0);
}

// Upgrade delegate event
$all_upgrades.delegate('upgrade', 'click', function(event) {
	var upgrade = this.upgrade;

	if ( upgrade.level >= upgrade.upgrade.levels ) {
		return;
	} else if (
		upgrade.ecost
		&& (!upgrade.erequires || upgrade_objects[upgrade.erequires].level)
		&& current_exotic_particles >= upgrade.ecost
	) {
		current_exotic_particles -= upgrade.ecost;
		$current_exotic_particles.innerHTML = fmt(current_exotic_particles);
		$refund_exotic_particles.innerHTML = fmt(total_exotic_particles - current_exotic_particles);
		upgrade.setLevel(upgrade.level + 1);
	} else if ( upgrade.cost && current_money >= upgrade.cost ) {
		current_money -= upgrade.cost;
		$money.innerHTML = fmt(current_money);
		upgrade.setLevel(upgrade.level + 1);
	} else {
		return;
	}

	update_tiles();
	check_upgrades_affordability();
});

var check_upgrades_affordability_timeout;
var check_upgrades_affordability = function(do_timeout) {
	for ( var i = 0, l = upgrade_objects_array.length, upgrade; i < l; i++ ) {
		upgrade = upgrade_objects_array[i];

		if (
			upgrade.level < upgrade.upgrade.levels
			&& (
				(
					upgrade.cost
					&& current_money >= upgrade.cost
				)
				||
				(
					upgrade.ecost
					&& (!upgrade.erequires || upgrade_objects[upgrade.erequires].level)
					&& (current_exotic_particles > upgrade.ecost)
				)
			)
		) {
			if ( upgrade.affordable === false ) {
				upgrade.affordable = true;
				upgrade.$el.className = upgrade.$el.className.replace(unaffordable_replace, '');
			}
		} else if ( upgrade.affordable === true ) {
			upgrade.affordable = false;
			upgrade.$el.className += ' unaffordable';
		}
	}

	if ( do_timeout === true ) {
		check_upgrades_affordability_timeout = setTimeout(function() {
			check_upgrades_affordability(true);
		}, 200);
	}

	$reboot_exotic_particles.innerHTML = fmt(exotic_particles);
};

  /////////////////////////////
 // Save game
/////////////////////////////

var $save = $('#save');
var srows;
var spart;
var sstring;
var squeue;
var supgrades;
var save = function() {
	srows = [];

	// Tiles
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];
		srow = [];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];

			if ( tile.part ) {
				srow.push({
					id: tile.part.id,
					ticks: tile.ticks,
					activated: tile.activated,
					heat_contained: tile.heat_contained
				});
			} else {
				srow.push(null);
			}
		}

		srows.push(srow);
	}

	// Tile queue
	squeue = [];
	for ( i = 0, l = tile_queue.length; i < l; i++ ) {
		tile = tile_queue[i];
		squeue.push({
			row: tile.row,
			col: tile.col
		});
	}

	// Upgrades
	supgrades = [];
	for ( i = 0, l = upgrade_objects_array.length; i < l; i++ ) {
		upgrade = upgrade_objects_array[i];
		supgrades.push({
			id: upgrade.upgrade.id,
			level: upgrade.level
		});
	}

	window.localStorage.setItem('rks', window.btoa(JSON.stringify({
		tiles: srows,
		tile_queue: squeue,
		upgrades: supgrades,
		current_power: current_power,
		current_money: current_money,
		current_heat: current_heat,
		exotic_particles: exotic_particles,
		current_exotic_particles: current_exotic_particles,
		total_exotic_particles: total_exotic_particles,
		paused: paused,
		auto_sell_disabled: auto_sell_disabled,
		auto_buy_disabled: auto_buy_disabled
	})));
};

$save.onclick = save;

// Select part
var active_replace = /[\b\s]part_active\b/;
var clicked_part = null;

$all_parts.delegate('part', 'click', function() {
	if ( clicked_part && clicked_part === this.part ) {
		clicked_part = null;
		this.className = this.className.replace(active_replace, '');
		$main.className = $main.className.replace(active_replace, '');
		part_tooltip_hide();
	} else {
		if ( clicked_part ) {
			clicked_part.$el.className = clicked_part.$el.className.replace(active_replace, '');
			$main.className = $main.className.replace(active_replace, '');
		}

		clicked_part = this.part;
		// TODO: DRY
		this.className += ' part_active';
		$main.className += ' part_active';
	}
});

// Add part to tile
var part_replace = /[\b\s]part_[a-z0-9_]+\b/;
var category_replace = /[\b\s]category_[a-z_]+\b/;
var spent_replace = /[\b\s]spent\b/;
var disabled_replace = /[\b\s]disabled\b/;
var exploding_replace = /[\b\s]exploding\b/;
var tile_mousedown = false;
var tile_mousedown_right = false;
var tile_queue = [];
var qi;
var tile2;

var apply_to_tile = function(tile, part, force) {
	if ( !tile.enabled && !force ) {
		return;
	}

	tile.part = part;
	tile.$el.className = tile.$el.className
		.replace(part_replace, '')
		.replace(category_replace, '')
		.replace(spent_replace, '')
		.replace(disabled_replace, '')
		.replace(exploding_replace, '')
		+ ' ' + part.className
		+ ' category_' + part.category
		;

	if ( part.ticks ) {
		if ( !tile.ticks ) {
			tile.$el.className += ' spent';
		}

		tile.$percent.style.width = tile.ticks / part.ticks * 100 + '%';
	}

	if ( !tile.activated ) {
		tile.$el.className += ' disabled';
	}
};

var rpl;
var rpqi;
var remove_part = function(tile, skip_update) {
	skip_update = skip_update || false;
	tile.part = null;
	tile.ticks = 0;
	tile.heat_contained = 0;
	tile.$percent.style.width = 0;
	tile.$el.className = tile.$el.className
		.replace(part_replace, '')
		.replace(category_replace, '')
		.replace(spent_replace, '')
		.replace(disabled_replace, '')
		;

	if ( !skip_update ) {
		update_tiles();
	}

	rpl = tile_queue.length;
	if ( rpl ) { 
		for ( rpqi = 0; rpqi < rpl; rpqi++ ) {
			tile2 = tile_queue[rpqi];
			if ( !tile2.part ) {
				tile_queue.splice(rpqi, 1);
				rpqi--;
				rpl--;
			}
		}
	}

	tile_tooltip_hide();
};

$tooltip_delete.onclick = function() {
	remove_part(tooltip_tile);
};

$tooltip_close.onclick = function() {
	if ( tooltip_tile ) {
		tile_tooltip_hide();
	} else if ( tooltip_part ) {
		part_tooltip_hide();
	} else if ( tooltip_upgrade ) {
		upgrade_tooltip_hide();
	}
};

var mouse_apply_to_tile = function(e) {
	tile = this.tile;

	if ( tile_mousedown_right ) {
		remove_part(tile);
	} else if (
		clicked_part
		&& (
			!tile.part
			|| (tile.part === clicked_part && tile.ticks === 0)
			|| (tile.part && tile.part.part.type === clicked_part.part.type && tile.part.part.level < clicked_part.part.level && current_money >= clicked_part.cost )
		)
	) {
		if ( current_money < clicked_part.cost ) {
			tile.activated = false;
			tile_queue.push(tile);
		} else {
			tile.activated = true;
			$money.innerHTML = fmt(current_money -= clicked_part.cost);
		}

		tile.ticks = clicked_part.ticks;

		apply_to_tile(tile, clicked_part);

		update_tiles();
	}
};

// Pause
var pause_replace = /[\b\s]paused\b/;
var $pause = $('#pause');

var pause = function() {
	clearTimeout(loop_timeout);
	$main.className += ' paused';
	paused = true;
};

$pause.onclick = pause;

// Unpause
var $unpause = $('#unpause');

var unpause = function() {
	loop_timeout = setTimeout(game_loop, loop_wait);
	$main.className = $main.className.replace(pause_replace, '');
	paused = false;
};

$unpause.onclick = unpause;

// Enable/Disable auto sell
var $disable_auto_sell = $('#disable_auto_sell');
var $enable_auto_sell = $('#enable_auto_sell');
var auto_sell_disabled_find = /[\b\s]auto_sell_disabled\b/;

var disable_auto_sell = function() {
	$main.className += ' auto_sell_disabled';
	auto_sell_disabled = true;
};

var enable_auto_sell = function() {
	$main.className = $main.className.replace(auto_sell_disabled_find, '');
	auto_sell_disabled = false;
};

$disable_auto_sell.onclick = disable_auto_sell;
$enable_auto_sell.onclick = enable_auto_sell;

// Enable/Disable auto buy
var $disable_auto_buy = $('#disable_auto_buy');
var $enable_auto_buy = $('#enable_auto_buy');
var auto_buy_disabled_find = /[\b\s]auto_buy_disabled\b/;

var disable_auto_buy = function() {
	$main.className += ' auto_buy_disabled';
	auto_buy_disabled = true;
};

var enable_auto_buy = function() {
	$main.className = $main.className.replace(auto_buy_disabled_find, '');
	auto_buy_disabled = false;
};

$disable_auto_buy.onclick = disable_auto_buy;
$enable_auto_buy.onclick = enable_auto_buy;

  /////////////////////////////
 // Load
/////////////////////////////

var $heat_percentage = $('#heat_percentage');
var $power_percentage = $('#power_percentage');

var update_heat_and_power = function() {
	$current_heat.innerHTML = fmt(current_heat);

	if ( current_heat < max_heat ) {
		$heat_percentage.style.width = current_heat / max_heat * 100 + '%';
	} else {
		$heat_percentage.style.width = '100%';
	}

	$current_power.innerHTML = fmt(current_power);
	$power_percentage.style.width = current_power / max_power * 100 + '%';

	if ( current_heat <= max_heat ) {
		$reactor.style.backgroundColor = 'transparent';
	} else if ( current_heat > max_heat && current_heat <= max_heat * 2 ) {
		$reactor.style.backgroundColor = 'rgba(255, 0, 0, ' + ((current_heat - max_heat) / max_heat) + ')';
	} else {
		$reactor.style.backgroundColor = 'rgb(255, 0, 0)';
	}
};

var update_nodes = function() {
	$current_heat.innerHTML = fmt(current_heat);
	$current_power.innerHTML = fmt(current_power);
	$money.innerHTML = fmt(current_money);
	$exotic_particles.innerHTML = fmt(exotic_particles);
	$current_exotic_particles.innerHTML = fmt(current_exotic_particles);
	$refund_exotic_particles.innerHTML = fmt(total_exotic_particles - current_exotic_particles);
};

var stile;
var supgrade;
var rks = window.localStorage.getItem('rks');
var srow;
var supgrade_object;
if ( rks ) {
	rks = JSON.parse(window.atob(rks));

	// Current values
	current_heat = rks.current_heat || current_heat;
	current_power = rks.current_power || current_power;
	current_money = rks.current_money || current_money;
	exotic_particles = rks.exotic_particles || exotic_particles;
	current_exotic_particles = rks.current_exotic_particles || current_exotic_particles;
	total_exotic_particles = rks.total_exotic_particles || total_exotic_particles;

	max_heat = rks.max_heat || max_heat;
	manual_heat_reduce = rks.manual_heat_reduce || manual_heat_reduce;
	paused = rks.paused || paused;
	auto_sell_disabled = rks.auto_sell_disabled || auto_sell_disabled;
	auto_buy_disabled = rks.auto_buy_disabled || auto_buy_disabled;

	if ( paused ) {
		pause();
	}

	if ( auto_sell_disabled ) {
		disable_auto_sell();
	}

	if ( auto_buy_disabled ) {
		disable_auto_buy();
	}

	set_manual_heat_reduce();
	set_auto_heat_reduce();

	// Tiles
	for ( ri = 0; ri < max_rows; ri++ ) {
		row = tiles[ri];
		srow = rks.tiles[ri];

		if ( srow ) {
			for ( ci = 0; ci < max_cols; ci++ ) {
				stile = srow[ci];

				if ( stile ) {
					tile = row[ci];
					tile.ticks = stile.ticks;
					tile.activated = stile.activated;
					tile.heat_contained = stile.heat_contained;
					part = part_objects[stile.id];
					apply_to_tile(tile, part, true);
				}
			}
		}
	}

	// Tile queue
	for ( i = 0, l = rks.tile_queue.length; i < l; i++ ) {
		stile = rks.tile_queue[i];
		tile_queue.push(tiles[stile.row][stile.col]);
	}

	// Upgrades
	for ( i = 0, l = rks.upgrades.length; i < l; i++ ) {
		supgrade = rks.upgrades[i];
		supgrade_object = upgrade_objects[supgrade.id];

		if ( supgrade_object ) {
			upgrade_objects[supgrade.id].setLevel(supgrade.level);
		}
	}

	update_nodes();
	update_tiles();
	update_heat_and_power();
}

  /////////////////////////////
 // Tile clicks
/////////////////////////////

var tile_mouseup_fn = function(e) {
	tile_mousedown = false;
};

document.oncontextmenu = function(e) {
	if ( tile_mousedown_right ) {
		e.preventDefault();
		tile_mousedown_right = false;
	}
};

$reactor.delegate('tile', 'click', function(e) {
	if ( !tile_mousedown ) {
		mouse_apply_to_tile.call(this, e);
	}
});

$reactor.delegate('tile', 'mousedown', function(e) {
	tile_mousedown = true;
	tile_mousedown_right = e.which === 3;
	e.preventDefault();

	if ( e.shiftKey ) {
		if ( this.tile.part ) {
			var ri, ci, row, tile;
			var level = this.tile.part.part.level;
			var type = this.tile.part.part.type;
			var active = this.tile.part.active;
			// All matching tiles
			for ( ri = 0; ri < rows; ri++ ) {
				row = tiles[ri];

				for ( ci = 0; ci < cols; ci++ ) {
					tile = row[ci];

					if ( !tile_mousedown_right && tile.part && type === tile.part.part.type ) {
						mouse_apply_to_tile.call(tile.$el, e);
					} else if ( tile_mousedown_right && tile.part && type === tile.part.part.type && level === tile.part.part.level ) {
						mouse_apply_to_tile.call(tile.$el, e);
					}
				}
			}
		} else {
			mouse_apply_to_tile.call(this, e);
		}
	} else {
		mouse_apply_to_tile.call(this, e);
	}
});

$reactor.onmouseup = tile_mouseup_fn;
$reactor.onmouseleave = tile_mouseup_fn;

$reactor.delegate('tile', 'mousemove', function(e) {
	if ( tile_mousedown ) {
		mouse_apply_to_tile.call(this, e);
	}
});

  /////////////////////////////
 // Sell
/////////////////////////////
var $sell = $('#sell');

$sell.onclick = function() {
	if ( current_power ) {
		current_money += current_power;
		current_power = 0;

		$money.innerHTML = fmt(current_money);
		$current_power.innerHTML = 0;
		$power_percentage.style.width = 0;
	}
};

  /////////////////////////////
 // Scrounge
/////////////////////////////

/* var $scrounge = $('#scrounge');

$scrounge.onclick = function() {
	if ( current_money < 10 && current_power === 0 ) {
		current_money += 1;

		$money.innerHTML = fmt(current_money);
	}
}; */

  /////////////////////////////
 // Game Loop
/////////////////////////////

var loop_timeout;
var do_update;
var reduce_heat;
var shared_heat;
var max_shared_heat;
var sell_amount;
var power_add;
var heat_add;
var heat_remove;
var meltdown;
var transfer_heat;
var ep_chance;
var lower_heat;
var power_sell_percent;
var heat_add_next_loop = 0;
var vent_reduce;
var max_heat_transfer;

var tile_percent;
var tile_containment_percent;
var total_containment;
var tile_containment_containment;
var total_containment_heat;
var target_percent;

var game_loop = function() {
	power_add = 0;
	heat_add = 0;
	heat_remove = 0;
	meltdown = false;

	if ( heat_add_next_loop > 0 ) {
		heat_add = heat_add_next_loop;
		heat_add_next_loop = 0;
	}

	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			if ( tile.activated && tile.part ) {
				if ( tile.part.category === 'cell' ) {
					if ( tile.ticks !== 0 ) {
						power_add += tile.power;
						heat_add += tile.heat;
						tile.ticks--;

						if ( tile.ticks === 0 ) {
							if ( auto_buy_disabled !== true && tile.part.perpetual && current_money >= tile.part.cost * 1.5 ) {
								// auto replenish cell
								current_money -= tile.part.cost * 1.5;
								$money.innerHTML = fmt(current_money);
								tile.ticks = tile.part.ticks;
								tile.$percent.style.width = '100%';
							} else {
								tile.$percent.style.width = '0';
								tile.$el.className += ' spent';
								update_tiles();
							}
						} else {
							tile.$percent.style.width = tile.ticks / tile.part.ticks * 100 + '%';
						}
					}
				} else if ( tile.part.category === 'reflector' ) {
					power_add += tile.power;
					heat_add += tile.heat;
					tile.ticks -= tile.cells.length;

					// TODO: dedupe this and cell ticks
					if ( tile.ticks === 0 ) {
						if ( tile.part.perpetual && current_money >= tile.part.cost ) {
							// auto replenish reflector
							current_money -= tile.part.cost;
							$money.innerHTML = fmt(current_money);
							tile.ticks = tile.part.ticks;
							tile.$percent.style.width = '100%';
						} else {
							tile.$el.className += ' exploding';
							remove_part(tile);
						}
					} else {
						tile.$percent.style.width = tile.ticks / tile.part.ticks * 100 + '%';
					}
				}

				// TODO: Find a better place/logic for this?
				// Add heat to containment part
				if ( tile.activated && tile.part && tile.part.containment ) {
					if ( tile.part.id === 'coolant_cell6' ) {
						tile.heat_contained += tile.heat / 2;
						power_add += tile.heat / 2;
					} else {
						tile.heat_contained += tile.heat;
					}
				}

				if ( tile.activated && tile.part && tile.part.category === 'particle_accelerator' ) {
					if ( tile.heat_contained ) {
						// Which more, tile heat or max heat, get the lesser
						lower_heat = tile.heat_contained > tile.part.ep_heat ? tile.part.ep_heat : tile.heat_contained;
						ep_chance = Math.log(lower_heat) / Math.pow(10, 5 - tile.part.part.level) * (lower_heat / tile.part.part.base_ep_heat);

						// TODO: show the ep chance to indicate maximum efficiency
						// console.log(ep_chance)

						if ( ep_chance > Math.random() ) {
							exotic_particles++;
							$exotic_particles.innerHTML = fmt(exotic_particles);
						}
					}
				}

			}
		}
	}

	// Inlets
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile_part = tile.part;
			l = tile.containments.length;

			if ( tile.activated && tile_part && tile_part.transfer && tile_part.category === 'heat_inlet' && l > 0 ) {
				// Figure out the maximum amount the part can transfer
				if ( transfer_multiplier ) {
					max_heat_transfer = tile_part.transfer * (1 + transfer_multiplier / 100);
				} else {
					max_heat_transfer = tile_part.transfer;
				}

				for ( pi = 0; pi < l; pi++ ) {
					tile_containment = tile.containments[pi];
					transfer_heat = max_heat_transfer;

					if ( tile_containment.heat_contained < max_heat_transfer ) {
						transfer_heat = tile_containment.heat_contained;
					}

					tile_containment.heat_contained -= transfer_heat;
					heat_add += transfer_heat;
				}
			}
		}
	}

	current_heat += heat_add;

	//$heat_per_tick.innerHTML = fmt(heat_add);
	$stats_heat.innerHTML = fmt(heat_add, 2);

	// Reduce reactor heat parts
	max_shared_heat = current_heat / heat_outlet_countainments_count;

	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile_part = tile.part;

			if ( tile.activated && tile_part && tile_part.transfer && tile.containments && tile_part.category !== 'heat_inlet' ) {
				l = tile.containments.length;

				// Figure out the maximum amount the part can transfer
				if ( transfer_multiplier ) {
					max_heat_transfer = tile_part.transfer * (1 + transfer_multiplier / 100);
				} else {
					max_heat_transfer = tile_part.transfer;
				}

				// This algo seems pretty sketchy ;p
				if ( tile_part.category === 'heat_exchanger' ) {
					total_containment = tile.part.containment;
					total_containment_heat = tile.heat_contained;

					// Figure out total heat and containment
					for ( pi = 0; pi < l; pi++ ) {
						tile_containment = tile.containments[pi];

						// Lie about coolant_cell6's max containment since half will be converted to power
						if ( tile_containment.part.id === 'coolant_cell6' ) {
							total_containment += (tile_containment.part.containment - tile_containment.heat_contained) * 2;
						// Lie about vent's max containment vented heat goes away
						} else if ( tile_containment.part.part.category === 'vent' ) {
							total_containment += tile_containment.part.containment + tile_containment.part.vent;
						} else {
							total_containment += tile_containment.part.containment;
						}

						total_containment_heat += tile_containment.heat_contained;
					}

					target_percent = total_containment_heat / total_containment;

					// First try to remove heat
					for ( pi = 0; pi < l; pi++ ) {
						tile_containment = tile.containments[pi];

						// Lie about coolant_cell6's max containment since half will be converted to power
						if ( tile_containment.part.id === 'coolant_cell6' ) {
							tile_containment_containment = (tile_containment.part.containment - tile_containment.heat_contained) * 2;
						// Lie about vent's max containment vented heat goes away
						} else if ( tile_containment.part.part.category === 'vent' ) {
							tile_containment_containment = tile_containment.part.containment + tile_containment.part.vent;
						} else {
							tile_containment_containment = tile_containment.part.containment;
						}

						tile_containment_percent = tile_containment.heat_contained / tile_containment_containment;

						if ( tile_containment_percent > target_percent ) {
							transfer_heat = (tile_containment_percent - target_percent) * total_containment_heat;

							if ( transfer_heat > max_heat_transfer ) {
								transfer_heat = max_heat_transfer;
							}

							if ( transfer_heat >  tile_containment.heat_contained ) {
								transfer_heat =  tile_containment.heat_contained;
							}

							// TODO: skip if vents can handle the heat
							if ( transfer_heat >= 1 ) {
								tile_containment.heat_contained -= transfer_heat;
								tile.heat_contained += transfer_heat;
							}
						}
					}

					// Then try to add heat
					for ( pi = 0; pi < l; pi++ ) {
						tile_percent = tile.heat_contained / tile.part.containment;
						transfer_heat = 0;

						tile_containment = tile.containments[pi];

						// Lie about coolant_cell6's max containment since half will be converted to power
						if ( tile_containment.part.id === 'coolant_cell6' ) {
							tile_containment_containment = (tile_containment.part.containment - tile_containment.heat_contained) * 2;
						// Lie about vent's max containment vented heat goes away
						} else if ( tile_containment.part.part.category === 'vent' ) {
							tile_containment_containment = tile_containment.part.containment + tile_containment.part.vent;
						} else {
							tile_containment_containment = tile_containment.part.containment;
						}

						tile_containment_percent = tile_containment.heat_contained / tile_containment_containment;

						if ( tile_containment_percent < target_percent ) {
							transfer_heat = (target_percent - tile_containment_percent) * tile_containment_containment;
						} else if ( tile_containment_percent < tile_percent ) {
							transfer_heat = (tile_percent - tile_containment_percent) * tile_containment_containment;
						}

						// Not sure if the lies above are useful with this
						if ( tile_containment.part.part.category === 'vent' && transfer_heat < tile_containment.part.vent - tile_containment.heat_contained ) {
							transfer_heat = tile_containment.part.vent - tile_containment.heat_contained;
						}

						if ( transfer_heat > max_heat_transfer ) {
							transfer_heat = max_heat_transfer;
						}

						if ( transfer_heat > tile.heat_contained ) {
							transfer_heat = tile.heat_contained;
						}

						if ( transfer_heat >= 1 ) {
							if ( tile_containment.part.id === 'coolant_cell6' ) {
								tile_containment.heat_contained += transfer_heat / 2;
								power_add += transfer_heat / 2;
							} else {
								tile_containment.heat_contained += transfer_heat;
							}

							tile.heat_contained -= transfer_heat;
						}
					}
				} else if ( tile_part.category === 'heat_outlet' ) {
					shared_heat = max_heat_transfer;

					// Distribute evenly
					if ( current_heat < max_heat_transfer * heat_outlet_countainments_count ) {
						shared_heat = current_heat / heat_outlet_countainments_count;
					}

					// If the heat in the reactor is less than transfer
					if ( shared_heat > max_shared_heat ) {
						shared_heat = max_shared_heat;
					}

					for ( pi = 0; pi < l; pi++ ) {
						tile_containment = tile.containments[pi];

						if ( tile_containment.part.id === 'coolant_cell6' ) {
							tile_containment.heat_contained += shared_heat / 2;
							power_add += shared_heat / 2;
						} else {
							tile_containment.heat_contained += shared_heat;
						}

						heat_remove += shared_heat;
					}
				}
			}
		}
	}

	current_heat -= heat_remove;

	// Auto heat reduction
	if ( current_heat > 0 ) {
		// TODO: Set these variables up in update tiles
		if ( current_heat <= max_heat ) {
			reduce_heat = max_heat / 10000;

			if ( heat_controlled ) {
				if ( heat_add - heat_remove < reduce_heat ) {
					reduce_heat = heat_add - heat_remove;
				}
			}
		} else {
			reduce_heat = (current_heat - max_heat) / 20;
			if ( reduce_heat < max_heat / 10000 ) {
				reduce_heat = max_heat / 10000;
			}

			for ( ri = 0; ri < rows; ri++ ) {
				row = tiles[ri];
				for ( ci = 0; ci < cols; ci++ ) {
					tile = row[ci];

					if ( tile.activated && tile.part && tile.part.containment ) {

						if ( tile.part.id === 'coolant_cell6' ) {
							tile.heat_contained += reduce_heat / tiles.length / 2;
							power_add += reduce_heat / tiles.length / 2;
						} else {
							tile.heat_contained += reduce_heat / tiles.length;
						}
					}
				}
			}
		}

		$auto_heat_reduce.innerHTML = '-' + fmt(reduce_heat);
		current_heat -= reduce_heat;
	}

	// Forceful Fusion
	if ( heat_power_multiplier && current_heat > 1000 ) {
		power_add *= heat_power_multiplier * (Math.log(current_heat) / Math.log(1000) / 100);
	}

	// Add power
	current_power += power_add;

	//$power_per_tick.innerHTML = fmt(power_add);
	$stats_power.innerHTML = fmt(power_add, 2);

	// Try to place parts in the queue
	if ( tile_queue.length ) {
		tile = tile_queue[0];

		if ( !tile.part || tile.activated ) {
			tile_queue.splice(0, 1);
		} else if ( tile.part && current_money >= tile.part.cost ) {
			current_money -= tile.part.cost;
			$money.innerHTML = fmt(current_money);
			tile.activated = true;
			tile.$el.className = tile.$el.className.replace(disabled_replace, '');
			tile_queue.splice(0, 1);
			update_tiles();
		}
	}

	// Apply heat to containment parts
	do_update = false;
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			if ( tile.activated && tile.part && tile.part.containment ) {
				if ( tile.part.vent ) {

					if ( vent_multiplier ) {
						vent_reduce = tile.part.vent * (1 + vent_multiplier / 100);
					} else {
						vent_reduce = tile.part.vent;
					}

					if ( vent_reduce > tile.heat_contained ) {
						vent_reduce = tile.heat_contained;
					}

					if ( tile.part.id === 'vent6' ) {
						if ( current_power < vent_reduce ) {
							vent_reduce = current_power;
						}

						current_power -= vent_reduce;
					}

					tile.heat_contained -= vent_reduce;

					if ( tile.heat_contained < 0 ) {
						tile.heat_contained = 0;
					}
				}

				if ( tile.heat_contained > tile.part.containment ) {
					if ( auto_buy_disabled !== true && tile.heat <= 0 && tile.part.category === 'capacitor' && upgrade_objects['perpetual_capacitors'].level > 0 && current_money >= tile.part.cost * 10 ) {
						current_money -= tile.part.cost * 10;
						heat_add_next_loop += tile.heat_contained;
						tile.heat_contained = 0;
					} else {
						tile.$el.className += ' exploding';
						if ( tile.part.category === 'particle_accelerator' ) {
							meltdown = true;
						}

						do_update = true;
						remove_part(tile, true);
					}
				}

				if ( tile.part ) {
					tile.$percent.style.width = tile.heat_contained / tile.part.containment * 100 + '%';
				}
			}
		}
	}

	if ( do_update ) {
		update_tiles();
	}

	// Auto Sell
	if ( !auto_sell_disabled ) {
		sell_amount = Math.ceil(max_power * auto_sell_multiplier);
		if ( sell_amount ) {
			if ( sell_amount > current_power ) {
				power_sell_percent = current_power / sell_amount;
				sell_amount = current_power;
			} else {
				power_sell_percent = 1;
			}

			current_power -= sell_amount;
			current_money += sell_amount;
			//$money_per_tick.innerHTML = fmt(sell_amount);
			$stats_cash.innerHTML = fmt(sell_amount, 2);
			$money.innerHTML = fmt(current_money);

			// Extreme capacitors frying themselves
			for ( ri = 0; ri < rows; ri++ ) {
				row = tiles[ri];

				for ( ci = 0; ci < cols; ci++ ) {
					tile = row[ci];

					if ( tile.activated && tile.part && tile.part.id === 'capacitor6' ) {
						tile.heat_contained += sell_amount * auto_sell_multiplier * power_sell_percent * .5;
					}
				}
			}
		}
	}

	if ( current_power > max_power ) {
		current_power = max_power;
	}

	if ( current_heat < 0 ) {
		current_heat = 0;
	}

	if ( meltdown ) {
		current_heat = max_heat * 2 + 1;
	}

	if ( meltdown || current_heat > max_heat * 2 ) {
		$reactor.style.backgroundColor = 'rgb(255, 0, 0)';

		do_update = false;
		for ( ri = 0; ri < rows; ri++ ) {
			row = tiles[ri];

			for ( ci = 0; ci < cols; ci++ ) {
				tile = row[ci];

				if ( tile.part ) {
					do_update = true;
					tile.$el.className += ' exploding';
					remove_part(tile, true);
				}
			}
		}

		if ( do_update ) {
			update_tiles();
		}
	}

	update_heat_and_power();

	if ( !paused ) {
		loop_timeout = setTimeout(game_loop, loop_wait);
	}

	if ( tooltip_update !== null ) {
		tooltip_update();
	}
};

// affordability loop
var check_affordability = function() {
	for ( i = 0, l = part_objects_array.length; i < l; i++ ) {
		part = part_objects_array[i];

		if (
			part.affordable
			&&
				(
					part.cost > current_money
					|| (part.erequires && !upgrade_objects[part.erequires].level)
				)
		) {
			part.affordable = false;
			part.$el.className += ' unaffordable';
		} else if (
			!part.affordable
			&& part.cost <= current_money
			&& (!part.erequires || upgrade_objects[part.erequires].level)
		) {
			part.affordable = true;
			part.$el.className = part.$el.className.replace(unaffordable_replace, '').replace(locked_find, '');
		}
	}
};

check_affordability();
update_tiles();

if ( !paused ) {
	loop_timeout = setTimeout(game_loop, loop_wait);
}

setInterval(check_affordability, 1000);

})();