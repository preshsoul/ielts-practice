var Main = {

	menuToggle: function() {
		$('#nav_toggle').on('click', function(e) {
			e.preventDefault();

			if ($('#mobile_menu').hasClass('visible')) {
				$('#mobile_menu').removeClass('visible');
				$('#mobile_menu').addClass('hidden');

				$('#mob_menu_underlay').removeClass('visible');
				$('#mob_menu_underlay').addClass('hidden');
			} else {
				$('#mobile_menu').addClass('visible');
				$('#mobile_menu').removeClass('hidden');

				$('#mob_menu_underlay').addClass('visible');
				$('#mob_menu_underlay').removeClass('hidden');
			}
		});

		$('#mob_menu_underlay').on('click', function(e) {
			$('#mobile_menu').removeClass('visible');
			$('#mobile_menu').addClass('hidden');
			$('#mob_menu_underlay').removeClass('visible');
			$('#mob_menu_underlay').addClass('hidden');			
		});
	},

	splide: function() {

		if( $('.splide').length )
		{


			new Splide('#splide', {
				perPage: 3,
				perMove: 1,
				arrows: false,
				pagination: false, // dots
				autoplay: true,
				trimSpace: false, // allow partial slides at ends
				snap: true,  // clicking a partially visible slide snaps to it
				interval: 4000,
				focus : 'center',
				padding: '5rem',
				gap: '30px',
				rewind : true, 
				mediaQuery: 'max', 
				breakpoints: {
					930: {
						perPage: 2,
					},
					640: {
						perPage: 1,
					},
				}
			}).mount();

			/*
		    document.addEventListener('DOMContentLoaded', function () {

				let splide = new Splide( '.splide', {
					perPage: 3,
					type: 'loop',
					perMove: 1,
					pagination: false,
					padding: '5rem',
					gap: '30px',
					focus  : 'center',
					arrows: false,
					rewind : true,
					mediaQuery: 'max',
					breakpoints: {
						930: {
							perPage: 2,
						},
						640: {
							perPage: 1,
						},
					}

				} ).mount();

				//attach events to custom prev-next arrows
				// document.getElementById('btnNext').addEventListener('click', e => {
				// 	splide.go('+1');
				// });

				// document.getElementById('btnPrev').addEventListener('click', e => {
				// 	splide.go('-1');
				// });

		    });
		    */
		}
	},

	cookies: function() {
		var cookies = new cookieBanner({
			cookieName: "cookieBanner", 
			forceDecision: true, 
			// assumeConsent: false,
			frostyOverlay: false,
			cookieTimeout: 90, 
			rejectButton: true,
			textBannerButton: 'Accept',
			textBannerRejectButton: 'Decline', 
			privacyPage : "/privacy-policy/", 
			debug : true, 
		});
	},

	siteSearch: function() {
		const $search = $('.site-search');

		if ( ! $search.length ) {
			return;
		}

		$search.on('click', function(e) {
			e.stopPropagation();
		});

		$search.on('click', '.site-search-toggle', function(e) {
			e.preventDefault();
			e.stopPropagation();

			const $container = $(this).closest('.site-search');
			$container.toggleClass('is-open');

			const isOpen = $container.hasClass('is-open');
			$(this).attr('aria-expanded', isOpen ? 'true' : 'false');

			if ( isOpen ) {
				const $input = $container.find('input[type="search"]').first();
				$input.focus();
			}
		});

		$(document).on('click', function() {
			$search.removeClass('is-open');
			$search.find('.site-search-toggle').attr('aria-expanded', 'false');
		});

		$(document).on('keydown', function(e) {
			if ( e.key === 'Escape' ) {
				$search.removeClass('is-open');
				$search.find('.site-search-toggle').attr('aria-expanded', 'false');
			}
		});
	},

	responsiveTables: function() {
		$('.copystyles table').wrap('<div style="overflow-x:auto;"  class="table_wrap"></div>');
	},


	teamFilter: function() {
		$('select.team_groups_choice').on('change', function() {
			var url = $(this).val();

			if(url == '0') {
				window.location = '/team/'; // URL for when user clicks 'View All'

			} else {
				window.location = '/team-group/' + url;
			}
			return false;
		});
	},

	// tabs: function() {
	// 	$( ".tabs" ).tabs();
	// },

	accordion: function() {
		$(".accordion" ).accordion({
			heightStyle: "content"
		});

	},

	filters: function() {
		const jumpTo = getQueryParam('jump-to');

		if (jumpTo)
		{
			const $target = $('#' + jumpTo);

			if ($target.length)
			{
				// Smooth scroll to element
				$('html, body').animate({
					scrollTop: $target.offset().top - 50
				}, 600); // 600ms scroll duration
			}
		}
	},

	scholarshipList: function() {
		const $listing = $('.scholarships-listing');

		if ( ! $listing.length || ! window.CT_AJAX || ! CT_AJAX.url ) {
			return;
		}

		const $form = $listing.find('form');
		const $list = $listing.find('.scholarship-list');
		let $pagination = $listing.find('.scholarship-pagination');
		const $count = $listing.find('.item-count b');

		if ( ! $pagination.length ) {
			$pagination = $('<div class="scholarship-pagination"></div>');
			$list.after($pagination);
		}

		const buildFilters = function() {
			const country = $form.find('select[name="country"]').val() || '';
			const search = $form.find('input[name="search"]').val() || '';
			const degree = $form.find('input[name="degree[]"]:checked').map(function() {
				return this.value;
			}).get();

			return {
				country,
				search,
				degree,
			};
		};

		const updateUrl = function( page, filters ) {
			if ( typeof window.URL === 'undefined' || typeof window.URLSearchParams === 'undefined' ) {
				return;
			}

			const url = new URL(window.location);
			url.hash = 'scholarship-listing';

			if ( filters.country ) {
				url.searchParams.set( 'country', filters.country );
			} else {
				url.searchParams.delete( 'country' );
			}

			if ( filters.search ) {
				url.searchParams.set( 'search', filters.search );
			} else {
				url.searchParams.delete( 'search' );
			}

			url.searchParams.delete( 'degree[]' );
			filters.degree.forEach(function(level) {
				url.searchParams.append( 'degree[]', level );
			});

			if ( page && page > 1 ) {
				url.searchParams.set( 'paged', page );
			} else {
				url.searchParams.delete( 'paged' );
			}

			url.searchParams.set( 'jump-to', 'scholarship-listing' );

			window.history.replaceState( {}, '', url );
		};

		const getPagedFromHref = function( href ) {
			const match = href.match( /[?&]paged=(\d+)/ );
			return match ? parseInt( match[1], 10 ) : null;
		};

		const fetchResults = function( page ) {
			const filters = buildFilters();
			const data = {
				action: 'ct_fetch_scholarships',
				paged: page || 1,
				country: filters.country,
				search: filters.search,
			};

			if ( filters.degree.length ) {
				data.degree = filters.degree;
			}

			$list.addClass('is-loading');

			$.ajax({
				url: CT_AJAX.url,
				method: 'GET',
				data: data,
				dataType: 'json',
			})
			.always(function() {
				$list.removeClass('is-loading');
			})
			.done(function( response ) {
				if ( ! response.success ) {
					$list.html( '<div class="scholarship-empty-state">Unable to load scholarships right now.</div>' );
					$pagination.empty();
					$count.text(0);
					return;
				}

				const responseData = response.data || {};
				$list.html( responseData.html || '<div class="scholarship-empty-state">No scholarships found.</div>' );
				$pagination.html( responseData.pagination || '' );
				$count.text( responseData.found || 0 );

				updateUrl( page || 1, filters );
			});
		};

		$form.on('submit', function( e ) {
			e.preventDefault();
			fetchResults( 1 );
		});

		$form.on('change', 'select[name="country"], input[name="degree[]"]', function() {
			fetchResults( 1 );
		});

		$pagination.on('click', '.page-numbers a', function( e ) {
			e.preventDefault();
			const href = $( this ).attr('href') || '';
			const page = getPagedFromHref( href ) || 1;
			fetchResults( page );
		});

		const initialPage = ( typeof window.URLSearchParams === 'undefined' ) ? 1 : (parseInt( (new URLSearchParams(window.location.search)).get('paged'), 10 ) || 1);
		fetchResults( initialPage );
	},

	fellowMap: function() {
		if (typeof L === 'undefined')
		{
			// console.log('Leaflet not loaded');
			return;
		}

		if ( ! window.GEOJSON_DATA_URL || ! window.GEOJSON_DATA_URL.length )
		{
			console.error('GeoJSON data url not provided');
			return;
		}

		const COLORS = {
			inactive: '#6190c8',
			active: '#273b82',
			hover: '#273b82',
			border: '#ffffff'
		};

		const activeCountries = window.FELLOW_ACTIVE_COUNTRIES || {};

		// Toggle (set this however you like; example below wires it to a checkbox)
		let interactionsEnabled = false;

		const map = L.map('fellow-map', {
			worldCopyJump: true
		});

		L.tileLayer(
			'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=' + window.CT_MAPBOX_ACCESS_TOKEN,
			{
				id: 'chameleonstudios/cmklcc5ns00f901quh8l25ili',
				tileSize: 512,
				zoomOffset: -1,
				attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery &copy; <a href="http://mapbox.com">Mapbox</a>'
			}
		).addTo(map);

		map.setView([20, 0], 2);

		function countryStyle(feature)
		{
			const code = feature.properties["ISO3166-1-Alpha-2"];

			if ( activeCountries[code] )
			{
				return {
					fillColor: COLORS.active,
					color: COLORS.border,
					weight: 0.5,
					fillOpacity: 1
				};
			}

			return {
				fillColor: COLORS.inactive,
				color: COLORS.border,
				weight: 0.5,
				fillOpacity: 1
			};
		}

		let geojson;

		function setInteractionsEnabled(enabled)
		{
			interactionsEnabled = !!enabled;

			if ( ! geojson )
			{
				return;
			}

			geojson.eachLayer(function(layer)
			{
				const feature = layer.feature;
				if ( ! feature )
				{
					return;
				}

				const code = feature.properties["ISO3166-1-Alpha-2"];

				// Ensure we always remove existing handlers first
				if ( layer.__countryHandlers )
				{
					layer.off('mouseover', layer.__countryHandlers.mouseover);
					layer.off('mouseout', layer.__countryHandlers.mouseout);
					layer.off('click', layer.__countryHandlers.click);
					layer.__countryHandlers = null;
				}

				// Cursor + pointer events
				if ( layer.getElement && layer.getElement() )
				{
					layer.getElement().style.cursor = interactionsEnabled ? 'pointer' : '';
					layer.getElement().style.pointerEvents = interactionsEnabled ? 'auto' : 'none';
				}

				// Only active countries are interactive
				if ( ! activeCountries[code] )
				{
					return;
				}

				if ( ! interactionsEnabled )
				{
					if ( geojson && geojson.resetStyle )
					{
						geojson.resetStyle(layer);
					}

					return;
				}

				const handlers = {
					mouseover: function(e)
					{
						e.target.setStyle({
							fillColor: COLORS.hover,
							color: COLORS.border,
							weight: 1,
							fillOpacity: 1
						});
					},
					mouseout: function(e)
					{
						geojson.resetStyle(e.target);
					},
					click: function()
					{
						Fancybox.show([
							{
								src: '#' + activeCountries[code].popupId,
								type: 'inline'
							}
						]);
					}
				};

				layer.__countryHandlers = handlers;

				layer.on('mouseover', handlers.mouseover);
				layer.on('mouseout', handlers.mouseout);
				layer.on('click', handlers.click);
			});
		}

		function onEachCountry(feature, layer)
		{
			const code = feature.properties["ISO3166-1-Alpha-2"];

			if ( ! activeCountries[code] )
			{
				return;
			}

			// Apply initial cursor once SVG path exists
			layer.on('add', function()
			{
				if ( layer.getElement && layer.getElement() )
				{
					layer.getElement().style.cursor = interactionsEnabled ? 'pointer' : '';
					layer.getElement().style.pointerEvents = interactionsEnabled ? 'auto' : 'none';
				}
			});
		}

		fetch( window.GEOJSON_DATA_URL )
			.then(res => res.json())
			.then(data => {
				geojson = L.geoJSON(data, {
					style: countryStyle,
					onEachFeature: onEachCountry
				}).addTo(map);

				// Apply initial state
				setInteractionsEnabled(interactionsEnabled);

				// OPTIONAL: wire to a checkbox toggle if present
				// <input type="checkbox" id="map-interactions-toggle" checked>
				const toggleEl = document.querySelector('#map-interactions-toggle');
				if ( toggleEl )
				{
					interactionsEnabled = !!toggleEl.checked;
					setInteractionsEnabled(interactionsEnabled);

					toggleEl.addEventListener('change', function()
					{
						setInteractionsEnabled(!!toggleEl.checked);
					});
				}

				// OPTIONAL: expose a global helper for programmatic toggling
				window.setFellowMapInteractionsEnabled = setInteractionsEnabled;
			});
	},

	fellowMap2: function() {
		if( typeof L === 'undefined' )
		{
			console.error('Leaflet not loaded');
			return;
		}

		if( ! window.FELLOW_MAP_MARKERS || ! window.FELLOW_MAP_MARKERS.length )
		{
			console.warn('No fellow markers found');
			return;
		}

		if( ! window.CT_MAPBOX_ACCESS_TOKEN || ! window.CT_MAPBOX_ACCESS_TOKEN.length )
		{
			console.warn('Mapbox token not provided');
			return;
		}

		if( typeof Fancybox === 'undefined' )
		{
			console.error('Fancybox not loaded');
			return;
		}

		const map = L.map('fellow-map', {
			worldCopyJump: true
		});

		L.tileLayer(
			// 'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=' + window.CT_MAPBOX_ACCESS_TOKEN,
			'https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=' + window.CT_MAPBOX_ACCESS_TOKEN,
			{
				// id: 'mapbox/streets-v11',
				id: 'chameleonstudios/cjepie1fj5m1v2rmovlt45hkg',
				tileSize: 512,
				zoomOffset: -1,
				attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery &copy; <a href="http://mapbox.com">Mapbox</a>'
			}
		).addTo(map);

		const bounds = L.latLngBounds();

		window.FELLOW_MAP_MARKERS.forEach(function (marker) {
			if (!marker.lat || !marker.lng || !marker.popupId) {
				return;
			}

			const leafletMarker = L.marker([marker.lat, marker.lng]).addTo(map);

			leafletMarker.on('click', function () {
				Fancybox.show([
					{
						src: '#' + marker.popupId,
						type: 'inline'
					}
				]);
			});

			leafletMarker.bindTooltip(marker.title);

			bounds.extend([marker.lat, marker.lng]);
		});

		map.fitBounds(bounds, {
			padding: [40, 40],
			maxZoom: 5
		});
	},

	fancyBox: function() {

		Fancybox.bind("[data-fancybox]", {
			// custom options
		}); 

		Fancybox.bind('[data-fancybox="gallery"]', {
			// custom options
		});
	}, 

};
var $ = jQuery.noConflict();

jQuery(document).ready(function($) {

	Main.teamFilter();
	Main.menuToggle();
	// Main.stickyHeader();
	Main.splide();
	// Main.splideSlideshow();
	Main.accordion();
	Main.siteSearch();
	Main.responsiveTables();
	Main.filters();
	Main.scholarshipList();
	// Main.cookies();
	// Main.tabs();

	Main.fellowMap();
	Main.fancyBox();
});



// Get query string
function getQueryParam(name)
{
	const params = new URLSearchParams(window.location.search);
	return params.get(name);
}
