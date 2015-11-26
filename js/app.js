/*

TODO:

shift + right click on spent cells also gets rid of unspent cells
document part/upgrade keys
# of ticks total on cells on tooltip
ticks left on reactor part tooltip
selling
current reactor heat/power generation
right click to sell upgrades
Increase reactor size via upgrades
update upgrades section


*/


;(function() {
'use strict';

  /////////////////////////////
 // Delegate
/////////////////////////////

Element.prototype.delegate = function(className, type, fn) {
	var test = new RegExp('\\b' + className + '\\b');
	var $self = this;

	this['on' + type] = function(event) {
		event = event || window.event;
		var $target = event.target || event.srcElement;

		while( $target != $self ) {
			if ( $target.className.match(test) ) {
				return fn.call($target, event);
			}

			$target = $target.parentNode;
		}
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
	places = places || 3;

	// Math.floor returns exponents quicker for some reason
	floor_num = Math.floor(num).toString();

	// in case of exponents
	if ( (fmt_parts = floor_num.match(find_exponent)) ) {
		// Out of range of the friendly numbers
		if ( fmt_parts[5] > 35 ) {
			fnum = parseFloat(fmt_parts[1]) + 'e' + fmt_parts[5];
		// has a decimal
		} else if ( fmt_parts[3] ) {
			num = fmt_parts[2] + fmt_parts[4] + '00';
			fnum = parseFloat(num.substring(0, fmt_parts[5] % 3 + 1) + '.' + num.substring(fmt_parts[5] % 3 + 1, fmt_parts[5] % 3 + 4)) + cm_names[Math.floor(fmt_parts[5]/3) - 1];
		} else {
			num = fmt_parts[2] + '00';
			fnum = num.substring(0, fmt_parts[5] % 3 + 1) + cm_names[Math.floor(fmt_parts[5]/3) - 1];
		}
	} else {
		// http://userscripts-mirror.org/scripts/review/293573
		pow = Math.floor((floor_num.length - 1)/3) * 3;
		fnum = (Math.floor(num / Math.pow(10, pow - 3)) / Math.pow(10, 3)) + (pow == 0 ? "" : cm_names[(pow / 3) - 1]);
	}

	return fnum;
};

  /////////////////////////////
 // General
/////////////////////////////

// settings
var cols = 19;
var rows = 16;
var debug = false;
var base_loop_wait = 1000;
var base_power_multiplier = 1;
var base_heat_multiplier = 4;
var base_manual_heat_reduce = 1;
var upgrade_max_level = 32;
var base_max_heat = 1000;
var base_max_power = 100;

// Current
var current_heat = 0;
var current_power = 0;
var current_money = 10;
var max_heat = base_max_heat;
var auto_sell_multiplier = 0;
var max_power = base_max_power;
var loop_wait = base_loop_wait;
var power_multiplier = base_power_multiplier;
var heat_multiplier = base_heat_multiplier;
var manual_heat_reduce = base_manual_heat_reduce;
var vent_capacitor_multiplier = 0;
var vent_plating_multiplier = 0;
var transfer_capacitor_multiplier = 0;
var transfer_plating_multiplier = 0;
var heat_power_multiplier = 0;
var heat_controlled = 0;

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

var Tile = function(row, col) {
	this.$el = $('<button class="tile">');
	this.$el.tile = this;
	this.part = null;
	this.heat = 0;
	this.heat_contained = 0;
	this.power = 0;
	this.ticks = 0;
	this.containments = [];
	this.cells = [];
	this.activated = false;
	this.row = row;
	this.col = col;

	var $percent_wrapper_wrapper = $('<div class="percent_wrapper_wrapper">');
	var $percent_wrapper = $('<div class="percent_wrapper">');
	this.$percent = $('<p class="percent">');

	$percent_wrapper_wrapper.appendChild($percent_wrapper);
	$percent_wrapper.appendChild(this.$percent);
	this.$el.appendChild($percent_wrapper_wrapper);

	var $tooltip = $('<div class="description info">');


	if ( debug ) {
		this.$heat = $('<span class="heat">');
		this.$heat.innerHTML = fmt(this.heat);
		this.$el.appendChild(this.$heat);

		this.$power = $('<span class="power">');
		this.$power.innerHTML = fmt(this.power);
		this.$el.appendChild(this.$power);
	}
};

// Operations
var tiler;
var tileu;
var tilel;
var tiled;
var tile_containment;
var tile_cell;
var heat_remove;
var heat_outlet_countainments_count;
var transfer_multiplier = 0;
var vent_multiplier = 0;

var update_tiles = function() {
	heat_outlet_countainments_count = 0;
	transfer_multiplier = 0;
	vent_multiplier = 0;
	max_power = base_max_power;
	max_heat = base_max_heat;

	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile.heat = 0;
			tile.power = 0;
		}
	}

	// Alter counts
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];
		tileu = null;
		tiler = null;
		tiled = null;
		tilel = null;

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];
			tile.containments.length = 0;
			tile.cells.length = 0;

			if ( tile.part && tile.activated && (tile.part.category !== 'cell' || tile.ticks) ) {
				if ( ci < cols - 1 ) {
					tiler = row[ci + 1];
					if ( tiler.part && tiler.part.containment ) {
						tile.containments.push(tiler);
					} else if ( tiler.part && tiler.part.category === 'cell' ) {
						tile.cells.push(tiler);
					}
				}

				// left
				if ( ci > 0 ) {
					tilel = row[ci - 1];
					if ( tilel.part && tilel.part.containment ) {
						tile.containments.push(tilel);
					} else if ( tilel.part && tilel.part.category === 'cell' ) {
						tile.cells.push(tilel);
					}
				}

				// down
				if ( ri < rows - 1 ) {
					tiled = tiles[ri + 1][ci];
					if ( tiled.part && tiled.part.containment ) {
						tile.containments.push(tiled);
					} else if ( tiled.part && tiled.part.category === 'cell' ) {
						tile.cells.push(tiled);
					}
				}

				// up
				if ( ri > 0 ) {
					tileu = tiles[ri - 1][ci];
					if ( tileu.part && tileu.part.containment ) {
						tile.containments.push(tileu);
					} else if ( tileu.part && tileu.part.category === 'cell' ) {
						tile.cells.push(tileu);
					}
				}
			}

			if ( tile.part && tile.activated ) {
				if ( tile.part.category === 'heat_outlet' ) {
					heat_outlet_countainments_count += tile.containments.length;
				} else if ( tile.part.category === 'capacitor' ) {
					transfer_multiplier += tile.part.part.level * transfer_capacitor_multiplier;
					vent_multiplier += tile.part.part.level * vent_capacitor_multiplier;
				} else if ( tile.part.category === 'reactor_plating' ) {
					transfer_multiplier += tile.part.part.level * transfer_plating_multiplier;
					vent_multiplier += tile.part.part.level * vent_plating_multiplier;
				}
			}

		}
	}

	// heat and power generators
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];
		tileu = null;
		tiler = null;
		tiled = null;
		tilel = null;

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];

			if ( tile.part && tile.activated ) {
				// right
				if ( ci < cols - 1 ) {
					tiler = row[ci + 1];
				}

				// left
				if ( ci > 0 ) {
					tilel = row[ci - 1];
				}

				// down
				if ( ri < rows - 1 ) {
					tiled = tiles[ri + 1][ci];
				}

				// up
				if ( ri > 0 ) {
					tileu = tiles[ri - 1][ci];
				}

				if ( tile.part.category === 'cell' && tile.ticks ) {
					tile.heat += tile.part.heat;
					tile.power += tile.part.power;

					// neighbors
					// right
					if ( tiler && tiler.part && tiler.part.category === 'cell' && tiler.activated && tiler.ticks ) {
						tiler.heat += tile.part.heat * heat_multiplier;
						tiler.power += tile.part.power * power_multiplier;
					}

					// left
					if ( tilel && tilel.part && tilel.part.category === 'cell' && tilel.activated && tilel.ticks ) {
						tilel.heat += tile.part.heat * heat_multiplier;
						tilel.power += tile.part.power * power_multiplier;
					}

					// down
					if ( tiled && tiled.part && tiled.part.category === 'cell' && tiled.activated && tiled.ticks ) {
						tiled.heat += tile.part.heat * heat_multiplier;
						tiled.power += tile.part.power * power_multiplier;
					}

					// up
					if ( tileu && tileu.part && tileu.part.category === 'cell' && tileu.activated && tileu.ticks ) {
						tileu.heat += tile.part.heat * heat_multiplier;
						tileu.power += tile.part.power * power_multiplier;
					}
				}
			}
		}
	}

	// Cells
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];
		tileu = null;
		tiler = null;
		tiled = null;
		tilel = null;

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];

			if ( tile.part && tile.activated ) {
				if ( tile.part.category === 'cell' ) {
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
		tileu = null;
		tiler = null;
		tiled = null;
		tilel = null;

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];

			if ( tile.part && tile.activated ) {
				if ( tile.part.category === 'reflector' ) {
					l = tile.cells.length;

					if ( l ) {
						for ( i = 0; i < l; i++ ) {
							tile_cell = tile.cells[i];
							tile.power += tile_cell.power * ( tile.part.power_increase / 100 );
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
			if ( tile.part && tile.activated && tile.part.reactor_power ) {
				max_power += tile.part.reactor_power;
			}

			if ( tile.part && tile.activated && tile.part.reactor_heat ) {
				max_heat += tile.part.reactor_heat;
			}
		}
	}

	$max_power.innerHTML = fmt(max_power);
	$max_heat.innerHTML = fmt(max_heat);

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
var $parts = $('#parts');
var $cells = $('#cells');
var $xcells = $('#xcells');
var $reflectors = $('#reflectors');
var $capacitors = $('#capacitors');
var $money = $('#money');
var $cooling = $('#cooling');
var $current_heat = $('#current_heat');
var $current_power = $('#current_power');
var $max_heat = $('#max_heat');
var $max_power = $('#max_power');
var $main = $('#main');
var $upgrades = $('#upgrades');

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

if ( debug ) {
	$main.className += ' debug';
}

$max_heat.innerHTML = fmt(max_heat);
$max_power.innerHTML = fmt(max_power);

// create tiles
var $row;
for ( ri = 0; ri < rows; ri++ ) {
	$row = $('<div class="row">');
	$reactor.appendChild($row);
	row = [];

	for ( ci = 0; ci < cols; ci++ ) {
		tile = new Tile(ri, ci);
		row.push(tile);
		$row.appendChild(tile.$el);
	}

	tiles.push(row);
}

// Tile tooltips

// TODO: DRY this
var tile_tooltip_show = function(e) {
	var tile = this.tile;
	var part = tile.part;

	if ( !part ) return;

	part.showTooltip(tile);
	tooltip_showing = true;
	tooltip_update = (function(tile) {
		return function() {
			part.updateTooltip(tile);
		};
	})(tile);
	$main.className += ' tooltip_showing';
};

var tile_tooltip_hide = function(e) {
	// $tooltip.style.display = null;
	var part = this.part;

	tooltip_showing = false;
	tooltip_update = null;
	$main.className = $main.className.replace(tooltip_showing_replace, '');
};

$reactor.delegate('tile', 'mouseover', tile_tooltip_show);
$reactor.delegate('tile', 'focus', tile_tooltip_show);
$reactor.delegate('tile', 'blur', tile_tooltip_hide);
$reactor.delegate('tile', 'mouseout', tile_tooltip_hide);

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
	if ( id == 'upgrades_section' ) {
		check_upgrades_affordability(true);
	} else {
		clearTimeout(check_upgrades_affordability_timeout);
	}
});

  /////////////////////////////
 // Parts
/////////////////////////////

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
		base_cost: 4737000,
		base_ticks: 900,
		base_power: 7400,
		base_heat: 7400,
		cell_tick_upgrade_cost: 25000000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 25000000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 4737000000
	},
	{
		id: 'seaborgium',
		type: 'seaborgium',
		levels: 3,
		title: 'Seaborgium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 3939000000,
		base_ticks: 3600,
		base_power: 1582000,
		base_heat: 1582000,
		cell_tick_upgrade_cost: 20000000000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 20000000000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 3989000000000
	},
	{
		id: 'dolorium',
		type: 'dolorium',
		levels: 3,
		title: 'Dolorium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 3922000000000,
		base_ticks: 21600,
		base_power: 226966000,
		base_heat: 226966000,
		cell_tick_upgrade_cost: 20000000000000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 20000000000000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 3922000000000000
	},
	{
		id: 'nefastium',
		type: 'nefastium',
		levels: 3,
		title: 'Nefastium Cell',
		base_description: single_cell_description,
		category: 'cell',
		base_cost: 3586000000000000,
		base_ticks: 86400,
		base_power: 51871000000,
		base_heat: 51871000000,
		cell_tick_upgrade_cost: 17500000000000000,
		cell_tick_upgrade_multiplier: 10,
		cell_power_upgrade_cost: 17500000000000000,
		cell_power_upgrade_multiplier: 10,
		cell_perpetual_upgrade_cost: 3586000000000000000
	},
	{
		id: 'protium',
		type: 'protium',
		levels: 3,
		title: 'Protium Cell',
		base_description: single_cell_description + ' After being fully depleted, protium cells permanently generate 10% more power per depleted cell.',
		category: 'cell',
		experimental: true,
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
		cost_multiplier: 10,
		base_power_increase: 10,
		power_increase_multiplier: 1,
		base_ticks: 100,
		ticks_multiplier: 12.5
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
		containment_multiplier: 100
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
		base_vent: 8,
		vent_multiplier: 75,
		location: 'cooling'
	},
	/* {
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
	},*/
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
	/*{
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
	},*/
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
		id: 'particle_accelerator',
		type: 'particle_accelerator',
		title: 'Particle Accelerator',
		base_description: 'Generates Exotic Particles based on the heat contained. If this part explodes it causes instant reactor meltdown. Holds a maximum of %containment heat.',
		levels: 5,
		category: 'particle_accelerator',
		level: 1,
		base_cost: 1000000000000,
		cost_multiplier: 1000000,
		base_containment: 1000000,
		containment_multiplier: 1000000,
		location: 'cooling'
	}
];

var Part = function(part) {
	this.className = 'part_' + part.id;
	this.$el = document.createElement('BUTTON');
	this.$el.className = 'part ' + this.className;
	this.$el.part = this;

	this.part = part;
	this.id = part.id;
	this.category = part.category;
	this.heat = part.base_heat;
	this.power = part.base_power;
	this.heat_multiplier = part.base_heat_multiplier;
	this.power_multiplier = part.base_power_multiplier;
	this.power_increase = part.base_power_increase;
	this.ticks = part.base_ticks;
	this.containment = part.base_containment;
	this.vent = part.base_vent;
	this.reactor_power = part.base_reactor_power;
	this.reactor_heat = part.base_reactor_heat;
	this.transfer = part.base_transfer;
	this.cost = part.base_cost;
	this.affordable = true;
	this.perpetual = false;
	this.description = '';
	this.sells = 0;

	var $image = $('<div class="image">');
	$image.innerHTML = 'Click to Select';

	/*var $description = $('<div class="description info">');

	var $headline = $('<div class="headline">');
	$headline.innerHTML = part.title;

	this.$text = $('<p class="text">');

	var $cost_wrapper = $('<p class="cost_wrapper">');
	$cost_wrapper.innerHTML = 'Cost: ';

	this.$cost = $('<span class="cost">');

	$cost_wrapper.appendChild(this.$cost);

	$description.appendChild($headline);
	$description.appendChild(this.$text);
	$description.appendChild($cost_wrapper);*/

	this.$el.appendChild($image);
	// this.$el.appendChild($description);
};

Part.prototype.updateDescription = function(tile) {
	var description = this.part.base_description
		.replace(/%power_increase/, fmt(this.power_increase))
		.replace(/%reactor_power/, fmt(this.reactor_power))
		.replace(/%reactor_heat/, fmt(this.reactor_heat))
		.replace(/%ticks/, fmt(this.ticks))
		.replace(/%containment/, fmt(this.containment))
		.replace(/%count/, [1, 2, 4][this.part.level - 1])
		;

	if ( tile ) {
		description = description
			.replace(/%transfer/, fmt(this.transfer * (1 + transfer_multiplier / 100)))
			.replace(/%vent/, fmt(this.vent * (1 + vent_multiplier / 100) ))
			.replace(/%power/, fmt(tile.power))
			.replace(/%heat/, fmt(tile.heat))
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
	} else {
		this.updateDescription();
		$tooltip_cost.style.display = null;
		$tooltip_sells.style.display = 'none';
	}

	$tooltip_heat_per.style.display = 'none';
	$tooltip_power_per.style.display = 'none';
	$tooltip_heat_wrapper.style.display = 'none';
	$tooltip_heat.style.display = 'none';
	$tooltip_max_heat.style.display = 'none';

	this.updateTooltip(tile);
};

Part.prototype.updateTooltip = function(tile) {
	$tooltip_description.innerHTML = this.description;

	if ( !tile ) {
		$tooltip_cost.innerHTML = fmt(this.cost);
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
		}
	}

	part_obj = new Part(part);

	part_objects[part.id] = part_obj;
	part_objects_array.push(part_obj);

	part_obj.updateDescription();

	if ( part.category === 'cell' ) {
		if ( part.experimental ) {
			$xcells.appendChild(part_obj.$el);
		} else {
			$cells.appendChild(part_obj.$el);
		}
	} else if ( part.category === 'reflector' ) {
		$reflectors.appendChild(part_obj.$el);
	} else if ( part.category === 'capacitor' ) {
		$capacitors.appendChild(part_obj.$el);
	} else if ( part.location === 'cooling' ) {
		$cooling.appendChild(part_obj.$el);
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
var part_tooltip_show = function(e) {
	var part = this.part;

	part.showTooltip();
	tooltip_showing = true;
	tooltip_update = part.updateTooltip;
	$main.className += ' tooltip_showing';
};

var part_tooltip_hide = function(e) {
	var part = this.part;

	tooltip_showing = false;
	tooltip_update = null;
	$main.className = $main.className.replace(tooltip_showing_replace, '');
};

$parts.delegate('part', 'mouseover', part_tooltip_show);
$parts.delegate('part', 'focus', part_tooltip_show);
$parts.delegate('part', 'blur', part_tooltip_hide);
$parts.delegate('part', 'mouseout', part_tooltip_hide);
$parts.delegate('part', 'mouseup', part_tooltip_hide);

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
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['reactor_plating' + i];
				part.reactor_heat = part.part.base_reactor_heat * ( upgrade.level + 1 );
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
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['capacitor' + i];
				part.reactor_power = part.part.base_reactor_power * ( upgrade.level + 1 );
				part.containment = part.part.base_containment * ( upgrade.level + 1 );
				part.updateDescription();
			}
		}
	},
	{
		id: 'perpetual_capacitors',
		type: 'other',
		title: 'Perpetual Capacitors',
		description: 'Capacitors are automatically replaced when they are destroyed if they are on a cool surface. The replacement part will cost 1.5 times the normal cost.',
		cost: 5000,
		multiplier: 5,
		levels: 1,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['capacitor' + i];
				part.perpetual = upgrade.level ? true : false;
				part.updateDescription();
			}
		}
	},

	/*{
		id: 'improved_coolant_cells',
		type: 'other',
		title: 'Improved Coolant Cells',
		description: 'Coolant cells hold 100% more heat per level of upgrade.',
		cost: 5000,
		multiplier: 100,
		onclick: function(upgrade) {
			
		}
	},*/

	// Reflectors
	{
		id: 'improved_reflector_density',
		type: 'other',
		title: 'Improved Reflector Density',
		description: 'Reflectors last 100% longer per level of upgrade.',
		cost: 5000,
		multiplier: 100,
		onclick: function(upgrade) {
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
		description: 'Reflectors generate an additional 100% power per level of upgrade.',
		cost: 5000,
		multiplier: 100,
		onclick: function(upgrade) {
			var part;
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['reflector' + i];
				part.power_increase = part.part.base_power_increase * ( upgrade.level + 1 );
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
			for ( var i = 1; i <= 5; i++ ) {
				/*part = part_objects['heat_inlet' + i];
				part.transfer = part.part.base_transfer * ( upgrade.level + 1 );
				part.updateDescription();*/

				part = part_objects['heat_outlet' + i];
				part.transfer = part.part.base_transfer * ( upgrade.level + 1 );
				part.updateDescription();

				/*part = part_objects['heat_exchanger' + i];
				part.transfer = part.part.base_transfer * ( upgrade.level + 1 );
				part.containment = part.part.base_containment * ( upgrade.level + 1 );
				part.updateDescription();*/
			}
		}
	},
	{
		id: 'reinforced_heat_exchangers',
		type: 'exchangers',
		title: 'Reinforced Heat Exchangers',
		description: 'Each plating increases the effectiveness of exchangers by 1% per level of upgrade per level of plating.',
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
		description: 'Each capacitor increases the effectiveness of exchangers by 1% per level of upgrade per level of capacitor.',
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
			for ( var i = 1; i <= 5; i++ ) {
				part = part_objects['vent' + i];
				part.vent = part.part.base_vent * ( upgrade.level + 1 );
				part.updateDescription();
			}
		}
	},
	{
		id: 'improved_heatsinks',
		type: 'vents',
		title: 'Improved Heatsinks',
		description: 'Each plating increases the effectiveness of vents by 1% per level of upgrade per level of plating.',
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
		description: 'Each capacitor increases the effectiveness of vents by 1% per level of upgrade per level of capacitor.',
		cost: 1000,
		multiplier: 100,
		onclick: function(upgrade) {
			vent_capacitor_multiplier = upgrade.level;
		}
	}
];

// Experimental Upgrades
var experiments = [
	{
		id: 'laboratory',
		type: 'laboratory',
		title: 'Laboratory',
		description: 'Enables experimental upgrades.',
		ecost: 1,
		levels: 1,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'infused_cells',
		type: 'boost',
		title: 'Infused Cells',
		description: 'Each fuel cell produces an additional 100% base power per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'unleashed_cells',
		type: 'boost',
		title: 'Unleashed Cells',
		description: 'Each fuel cell produces two times their base heat and power per level of upgrade.',
		erequires: 'laboratory',
		ecost: 100,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'quantum_buffering',
		type: 'boost',
		title: 'Quantum Buffering',
		description: 'Capacitors and platings are two times as effective per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'full_spectrum_reflectors',
		type: 'boost',
		title: 'Full Spectrum Reflectors',
		description: 'Reflectors increase the power output of adjacent cells by an additional 5% per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'fluid_hyperdynamics',
		type: 'boost',
		title: 'Fluid Hyperdynamics',
		description: 'Heat vents, exchangers, inlets and outlets are two times as effective per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'fractal_piping',
		type: 'boost',
		title: 'Fractal Piping',
		description: 'Heat vents and exchangers hold two times their base heat per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'ultracryonics',
		type: 'boost',
		title: 'Ultracryonics',
		description: 'Coolant cells hold two times their base heat per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'phlembotinum_core',
		type: 'boost',
		title: 'Phlembotinum Core',
		description: 'Increase the base heat and power storage of the reactor by four times per level of upgrade.',
		erequires: 'laboratory',
		ecost: 50,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'protium_cells',
		type: 'cells',
		title: 'Protium Cells',
		description: 'Allows you to use protium cells.',
		erequires: 'laboratory',
		ecost: 50,
		levels: 1,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'unstable_protium',
		type: 'cells_boost',
		title: 'Unstable Protium',
		description: 'Protium cells last half as long and product twice as much power and heat per level.',
		erequires: 'laboratory',
		ecost: 500,
		multiplier: 2,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'vortex_cooling',
		type: 'other',
		title: 'Vortex Cooling',
		description: 'Allows you to use extreme coolant cells.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
		}
	},
	{
		id: 'experimental_capacitance',
		type: 'other',
		title: 'Experimental Capacitance',
		description: 'Allows you to use extreme capacitors.',
		erequires: 'laboratory',
		ecost: 10000,
		levels: 1,
		onclick: function(upgrade) {
		}
	},

];

var Upgrade = function(upgrade) {
	var me = this;
	this.max_level = upgrade.levels || upgrade_max_level;
	this.upgrade = upgrade;
	this.level = null;
	this.cost = null;
	this.part = upgrade.part || null;
	this.$el = $('<button class="upgrade">');
	this.$el.id = upgrade.id;
	this.$el.upgrade = upgrade;

	this.display_cost = '';

	var $image = $('<div class="image">');
	$image.innerHTML = 'Click to Upgrade';

	this.$levels = $('<span class="levels">');

	/*var $description = $('<div class="description info">');

	var $headline = $('<div class="headline">');
	$headline.id = upgrade.id + 'headline';
	$headline.innerHTML = upgrade.title;

	var $text = $('<p class="text">');
	$text.innerHTML = upgrade.description;

	var $cost_wrapper = $('<p class="cost_wrapper">');
	$cost_wrapper.innerHTML = 'Cost: ';

	this.$cost = $('<span class="cost">');

	$cost_wrapper.appendChild(this.$cost);

	$description.appendChild($headline);
	$description.appendChild($text);
	$description.appendChild($cost_wrapper);

	this.$el.appendChild($description);
	*/

	$image.appendChild(this.$levels);

	this.$el.appendChild($image);

	this.setLevel(0);
};

Upgrade.prototype.setLevel = function(level) {
	this.level = level;
	this.$levels.innerHTML = level;
	this.cost = this.upgrade.cost * Math.pow(this.upgrade.multiplier, this.level);

	if ( this.level >= this.max_level ) {
		this.display_cost = '--';
	} else {
		this.display_cost = fmt(this.cost);
	}

	this.upgrade.onclick(this);
}

Upgrade.prototype.showTooltip = function() {
	$tooltip_name.innerHTML = this.upgrade.title;

	$tooltip_cost.style.display = null;
	$tooltip_sells.style.display = 'none';
	$tooltip_heat_per.style.display = 'none';
	$tooltip_power_per.style.display = 'none';
	$tooltip_heat_wrapper.style.display = 'none';
	$tooltip_heat.style.display = 'none';
	$tooltip_max_heat.style.display = 'none';

	this.updateTooltip();
};

Upgrade.prototype.updateTooltip = function(tile) {
	$tooltip_description.innerHTML = this.upgrade.description;

	$tooltip_cost.innerHTML = this.display_cost;
};

// Upgrade tooltips
var upgrade_tooltip_show = function(e) {
	var upgrade = this.upgrade;

	upgrade.showTooltip();
	tooltip_showing = true;
	tooltip_update = upgrade.updateTooltip;
	$main.className += ' tooltip_showing';
};

var upgrade_tooltip_hide = function(e) {
	var upgrade = this.upgrade;

	tooltip_showing = false;
	tooltip_update = null;
	$main.className = $main.className.replace(tooltip_showing_replace, '');
};

$upgrades.delegate('upgrade', 'mouseover', upgrade_tooltip_show);
$upgrades.delegate('upgrade', 'focus', upgrade_tooltip_show);
$upgrades.delegate('upgrade', 'blur', upgrade_tooltip_hide);
$upgrades.delegate('upgrade', 'mouseout', upgrade_tooltip_hide);

// More stuff I guess

var upgrade_locations = {
	cell_tick_upgrades: $('#cell_tick_upgrades'),
	cell_power_upgrades: $('#cell_power_upgrades'),
	cell_perpetual_upgrades: $('#cell_perpetual_upgrades'),
	other: $('#other_upgrades'),
	vents: $('#vent_upgrades'),
	exchangers: $('#exchanger_upgrades'),
	experimental_laboratory: $('xlaboratory'),
	experimental_boost: $('xboost'),
	experimental_cells: $('xcells'),
	experimental_cell_boost: $('xcell_boost'),
	experimental_other: $('xother')
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
				part.power = part.part.base_power * ( upgrade.level + 1 );
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

// Upgrade delegate event
$upgrades.delegate('upgrade', 'click', function(event) {
	var upgrade = this.upgrade;

	if ( upgrade && current_money >= upgrade.cost ) {
		current_money -= upgrade.cost;
		$money.innerHTML = fmt(current_money);
		upgrade.setLevel(upgrade.level + 1);
	}

	update_tiles();
	check_upgrades_affordability();
});

var check_upgrades_affordability_timeout;
var check_upgrades_affordability = function(do_timeout) {
	for ( var i = 0, l = upgrade_objects_array.length, upgrade; i < l; i++ ) {
		upgrade = upgrade_objects_array[i];
		if ( current_money < upgrade.cost ) {
			upgrade.$el.className += ' unaffordable';
		} else {
			upgrade.$el.className = upgrade.$el.className.replace(unaffordable_replace, '');
		}
	}

	if ( do_timeout === true ) {
		check_upgrades_affordability_timeout = setTimeout(check_upgrades_affordability, 200);
	}
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
		current_heat: current_heat
	})));
};

$save.onclick = save;

// Select part
var active_replace = /[\b\s]active\b/;
var clicked_part = null;

$parts.delegate('part', 'click', function() {
	if ( clicked_part && clicked_part === this.part ) {
		clicked_part = null;
		this.className = this.className.replace(active_replace, '');
	} else {
		if ( clicked_part ) {
			clicked_part.$el.className = clicked_part.$el.className.replace(active_replace, '');
		}
		clicked_part = this.part;
		this.className += ' active';
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

var apply_to_tile = function(tile, part) {
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

  /////////////////////////////
 // Load
/////////////////////////////

var stile;
var supgrade;
var rks = window.localStorage.getItem('rks');
var srow;
var supgrade_object;
if ( rks ) {
	rks = JSON.parse(window.atob(rks));

	// Current values
	$current_heat.innerHTML = fmt(current_heat = rks.current_heat || current_heat);
	$current_power.innerHTML = fmt(current_power = rks.current_power || current_power);
	$money.innerHTML = fmt(current_money = rks.current_money || current_money);

	max_heat = rks.max_heat || max_heat;
	manual_heat_reduce = rks.manual_heat_reduce || manual_heat_reduce;

	set_manual_heat_reduce();
	set_auto_heat_reduce();

	// Tiles
	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];
		srow = rks.tiles[ri];

		if ( srow ) {
			for ( ci = 0; ci < cols; ci++ ) {
				stile = srow[ci];

				if ( stile ) {
					tile = row[ci];
					tile.ticks = stile.ticks;
					tile.activated = stile.activated;
					tile.heat_contained = stile.heat_contained;
					part = part_objects[stile.id];
					apply_to_tile(tile, part);
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

	update_tiles();
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

var $heat_percentage = $('#heat_percentage');
var $power_percentage = $('#power_percentage');

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

var game_loop = function() {
	power_add = 0;
	heat_add = 0;
	heat_remove = 0;
	meltdown = false;

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
							if ( tile.part.perpetual && current_money >= tile.part.cost ) {
								// auto replenish cell
								current_money -= tile.part.cost;
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
					tile.heat_contained += tile.heat;
				}

			}
		}
	}

	current_heat += heat_add;

	// Reduce reactor heat parts
	max_shared_heat = current_heat / heat_outlet_countainments_count;

	for ( ri = 0; ri < rows; ri++ ) {
		row = tiles[ri];

		for ( ci = 0; ci < cols; ci++ ) {
			tile = row[ci];

			if ( tile.activated && tile.part && tile.part.transfer && tile.containments ) {
				l = tile.containments.length;
				if ( transfer_multiplier ) {
					shared_heat = tile.part.transfer * (1 + transfer_multiplier / 100);
				} else {
					shared_heat = tile.part.transfer;
				}

				if ( current_heat < shared_heat * l ) {
					shared_heat = current_heat / l;
				}

				if ( shared_heat > max_shared_heat ) {
					shared_heat = max_shared_heat;
				}

				for ( pi = 0; pi < l; pi++ ) {
					tile_containment = tile.containments[pi];
					tile_containment.heat_contained += shared_heat;
					heat_remove += shared_heat;
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
						tile.heat_contained += reduce_heat / tiles.length;
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
						tile.heat_contained -= tile.part.vent * (1 + vent_multiplier / 100);
					} else {
						tile.heat_contained -= tile.part.vent;
					}

					if ( tile.heat_contained < 0 ) {
						tile.heat_contained = 0;
					}
				}

				if ( tile.heat_contained > tile.part.containment ) {
					tile.$el.className += ' exploding';
					if ( tile.part.category === 'particle_accelerator' ) {
						meltdown = true;
					}

					do_update = true;
					remove_part(tile, true);
				} else {
					tile.$percent.style.width = tile.heat_contained / tile.part.containment * 100 + '%';
				}
			}
		}
	}

	if ( do_update ) {
		update_tiles();
	}

	// Auto Sell
	sell_amount = Math.ceil(max_power * auto_sell_multiplier);
	if ( sell_amount ) {
		if ( sell_amount > current_power ) {
			sell_amount = current_power;
		}

		current_power -= sell_amount;
		current_money += sell_amount;
		$money.innerHTML = fmt(current_money);
	}

	if ( current_power > max_power ) {
		current_power = max_power;
	}

	if ( current_heat < 0 ) {
		current_heat = 0;
	}

	if ( meltdown ) {
		current_heat = max_heat * 2;
	}

	$current_heat.innerHTML = fmt(current_heat);
	if ( current_heat < max_heat ) {
		$heat_percentage.style.width = current_heat / max_heat * 100 + '%';
	} else {
		$heat_percentage.style.width = '100%';
	}

	$current_power.innerHTML = fmt(current_power);
	$power_percentage.style.width = current_power / max_power * 100 + '%';

	if ( !meltdown && current_heat <= max_heat ) {
		$reactor.style.backgroundColor = 'transparent';
	} else if ( !meltdown && current_heat > max_heat && current_heat <= max_heat * 2 ) {
		$reactor.style.backgroundColor = 'rgba(255, 0, 0, ' + ((current_heat - max_heat) / max_heat) + ')';
	} else {
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

	loop_timeout = setTimeout(game_loop, loop_wait);
};

// Pause
var pause_replace = /[\b\s]paused\b/;
var $pause = $('#pause');

var pause = function() {
	clearTimeout(loop_timeout);
	$main.className += ' paused';
};

$pause.onclick = pause;

// Unpause
var $unpause = $('#unpause');

var unpause = function() {
	loop_timeout = setTimeout(game_loop, loop_wait);
	$main.className = $main.className.replace(pause_replace, '');
};

$unpause.onclick = unpause;

// affordability loop
var check_affordability = function() {
	for ( i = 0, l = part_objects_array.length; i < l; i++ ) {
		part = part_objects_array[i];
		if ( part.affordable && part.cost > current_money ) {
			part.affordable = false;
			part.$el.className += ' unaffordable';
		} else if ( !part.affordable && part.cost <= current_money ) {
			part.affordable = true;
			part.$el.className = part.$el.className.replace(unaffordable_replace, '');
		}
	}
};

check_affordability();
game_loop();

setInterval(check_affordability, 1000);

})();