 $(top).on('stonehearthReady', function(cc) {
     if (!App.gameView) {
         return;
     }
     var itemCountDisplay = App.gameView.getView(App.StonehearthItemCountDisplayView);
     if (!itemCountDisplay) {
         var view = App.gameView.addView(App.StonehearthItemCountDisplayView, {});
     }
 });
 App.StonehearthItemCountDisplayView = App.View.extend({
     templateName: 'itemCountDisplay',
     uriProperty: 'model',
     initialized: true,
     TrackedItems: {
         "ingredients": [
             {
                 "material": "wood resource",
             },
             {
                 "material": "stone resource",
             },
             {
                 "material": "clay resource",
             },
             {
                 "material": "fiber resource",
             }
         ],
     },
     FormattedItems: null,
     getTrackedItems: function() {
         return this.TrackedItems;
     },
     getFormattedItems: function() {
         return this.FormattedItems;
     },
     _init: function() {
         var self = this;
         this._super();
         self.set('town_name', App.stonehearthClient.settlementName())
         App.jobController.addChangeCallback('top_items', function() {
             self.set('num_workers', App.jobController.getNumWorkers());
             self.set('num_crafters', App.jobController.getNumCrafters());
             self.set('num_soldiers', App.jobController.getNumSoldiers());
             var num_total = App.jobController.getNumSoldiers() + App.jobController.getNumCrafters() + App.jobController.getNumWorkers();
             var req_worth = Math.max(Math.max((num_total - 6), 0.5) * 550,(num_total * num_total - 18 * num_total) * 100);           
             var req_food = Math.floor(50 + Math.max((num_total - 7) / Math.max((51 - num_total) / 10, 1), 0) * 200);
             self.set('req_worth', req_worth);
             self.set('req_food', req_food);
         }, true);
         self.radiantTrace = new RadiantTrace()
         self.scoreTrace = self.radiantTrace.traceUri(App.stonehearthClient.gameState.scoresUri, {});
         self.scoreTrace.progress(function(eobj) {
             self.set('score_data', eobj);
         });
     },
     didInsertElement: function() {
         var self = this
         this._super();

        setTimeout(function() {self._init()}, 1000);
        
         var user_items = [];
         //init the inventory and usable object trackers
         radiant.call_obj('stonehearth.inventory', 'get_item_tracker_command', 'stonehearth:usable_item_tracker')
             .done(function(response) {
                 var itemTraces = {
                     "tracking_data": {
                         "stonehearth:loot:gold": {
                             "items": {
                                 "*": {
                                     "stonehearth:stacks": {}
                                 }
                             }
                         }
                     }
                 };
                 self._playerUsableInventoryTrace = new StonehearthDataTrace(response.tracker, itemTraces)
                     .progress(function(response) {
                         var inventoryItems = {}
                         var goldStack = 0;
                         radiant.each(response.tracking_data, function(uri, item) {
                             if (uri === "stonehearth:loot:gold") {
                                 if (!inventoryItems[uri]) {
                                     inventoryItems[uri] = item;
                                 }
                                 goldStack += radiant.map_to_array(inventoryItems[uri].items).reduce(function(a, b) {
                                     return a + b["stonehearth:stacks"].stacks;
                                 }, goldStack);
                                 inventoryItems[uri].count = goldStack;
                             }
                         });
                         self.usableInventoryTracker = response.tracking_data;
                         self._setViewStyling();
                     });
             })
             .fail(function(response) {
                 console.error(response);
             });
         //inventory tab
         this._inventoryPalette = this.$('#inventoryPalette').stonehearthItemPalette({
             cssClass: 'customInventoryItem',
             click: function (item) {
                self.addToArray(item, user_items);
             }
         });
         radiant.call_obj('stonehearth.inventory', 'get_item_tracker_command', 'stonehearth:usable_item_tracker')
         .done(function(response) {
           if (self.isDestroying || self.isDestroyed) {
               return;
           }
           var itemTraces = {
               "tracking_data": {}
           };
           if (!self._inventoryPalette) {
               return;
           }
           self._playerInventoryTrace = new StonehearthDataTrace(response.tracker, itemTraces)
            .progress(function(response) {
               var inventoryItems = {}
               var total_num_items = 0;
                  // merge iconic and root entities
                  radiant.each(response.tracking_data, function(uri, uri_entry) {
                     radiant.each(uri_entry.item_qualities, function (item_quality_key, item) {
                        var rootUri = uri;

                        if (uri_entry.canonical_uri) {
                           rootUri = uri_entry.canonical_uri;
                        }
                        var key = rootUri + App.constants.item_quality.KEY_SEPARATOR + item_quality_key;
                        var isIconic = false;
                        if (uri_entry.canonical_uri && uri_entry.canonical_uri.__self != uri_entry.uri.__self) {
                           isIconic = true;
                        }
                        if (!inventoryItems[key]) {
                           inventoryItems[key] = radiant.shallow_copy(uri_entry);
                           inventoryItems[key].count = item.count;
                        } else {
                           inventoryItems[key].count = inventoryItems[key].count + item.count;
                        }
                        inventoryItems[key].item_quality = item_quality_key;
                        if (isIconic) {
                           var numUndeployed = item.count;
                           // Add an additional tip to the item for the number of undeployed items in the world.
                           inventoryItems[key].additionalTip = i18n.t('stonehearth:ui.game.entities.tooltip_num_undeployed', { num_undeployed: numUndeployed });
                        }
                        total_num_items += item.count;
                     });
                  });

                  self._inventoryPalette.stonehearthItemPalette('updateItems', inventoryItems);

                  self.set('inventory_item_count', total_num_items);
               });
       })
         .fail(function(response) {
           console.error(response);
       });
         $(window).click(function() {
             if (!$(event.target).closest('#inventoryTab').length) {
                 if ($('#inventoryTab').is(":visible")) {
                     $('#inventoryTab').hide();
                 }
             }
         });
         self.$().on('click', '#add_res ', function() {
             $("#inventoryTab").css("display", "block")
             event.stopPropagation();
         });
         self.$().on('click', '.resource ', function() {
             var item = this;
             self.removeFromArray(item, user_items);
             event.stopPropagation();
         });
     },
     destroy: function() {
         if (this._playerInventoryTrace) {
             this._playerInventoryTrace.destroy();
             this._playerInventoryTrace = null;
         }
         if (this._playerUsableInventoryTrace) {
             this._playerUsableInventoryTrace.destroy();
             this._playerUsableInventoryTrace = null;
         }
     },
     // This redraws the elements when we add or remove an item
     itemsChanged: function() {
         Ember.run.scheduleOnce('afterRender', this, '_updateItems');
     }.observes('TrackedItems').on('didInsertElement'),
     itemsUpdated: function() {
         Ember.run.scheduleOnce('afterRender', this, '_setViewStyling');
     }.observes('FormattedItems').on('didInsertElement'),
     _updateItems: function() {
         var self = this;
         var recipe = self.getTrackedItems();
         FormattedItems = radiant.shallow_copy(recipe);
         FormattedItems.ingredients = []
         radiant.each(recipe.ingredients, function(i, ingredient) {
             var formatted_ingredient = radiant.shallow_copy(ingredient);
             if (formatted_ingredient.material) {
                 formatted_ingredient.identifier = formatted_ingredient.material.split(' ').sort().join(' ');
                 formatted_ingredient.kind = 'material';
                 var formatting = App.resourceConstants.resources[ingredient.material];
                 if (formatting) {
                     formatted_ingredient.name = i18n.t(formatting.name);
                     formatted_ingredient.icon = formatting.icon;
                 } else {
                     // XXX, roll back to some generic icon
                     formatted_ingredient.name = i18n.t(ingredient.material);
                 }
             } else {
                 formatted_ingredient.identifier = formatted_ingredient.uri;
                 formatted_ingredient.kind = 'uri';
                 if (ingredient.uri) {;
                     var catalog = App.catalog.getCatalogData(ingredient.uri);
                     if (catalog) {
                         formatted_ingredient.icon = catalog.icon;
                         formatted_ingredient.name = i18n.t(catalog.display_name);;
                         formatted_ingredient.uri = ingredient.uri;
                     }
                 } else {
                     console.log("no ingredient uri " + recipe_key);
                 }
             }
             FormattedItems.ingredients.push(formatted_ingredient);
             self.set("FormattedItems", FormattedItems);
             self.propertyDidChange('FormattedItems');
         });
     },
     _setViewStyling: function() {
         var self = this;
         if (self.$('[title]')) {
             self.$('[title]').tooltipster();
         }
         var recipe = this.getFormattedItems();
         if (recipe) {
             if (self.usableInventoryTracker) {
                 var ingredients = recipe.ingredients;
                 var i = 0;
                 $('div#itemCountDisplay > #resource_tracker > .resource').each(function(index, ingredientDiv) {
                     var current_item = ingredients[i];
                     var formatted_ingredient = radiant.shallow_copy(current_item);
                     if (current_item && current_item.material) {
                         formatted_ingredient.identifier = formatted_ingredient.material.split(' ').sort().join(' ');
                         formatted_ingredient.kind = 'material';
                         formatted_ingredient.available = radiant.findUsableCount(formatted_ingredient, self.usableInventoryTracker);
                         var formatting = App.resourceConstants.resources[current_item.material];
                         if (formatting) {
                             formatted_ingredient.name = i18n.t(formatting.name);
                             formatted_ingredient.icon = formatting.icon;
                             $(ingredientDiv).find('.numHave').text(formatted_ingredient.available);
                         } else {
                             // XXX, roll back to some generic icon
                             formatted_ingredient.name = i18n.t(current_item.material);
                         }
                     } else {
                         formatted_ingredient.identifier = formatted_ingredient.uri;
                         formatted_ingredient.kind = 'uri';
                         formatted_ingredient.available = radiant.findUsableCount(formatted_ingredient, self.usableInventoryTracker);
                         if (current_item.uri) {;
                             var catalog = App.catalog.getCatalogData(current_item.uri);
                             if (catalog) {
                                 // console.log(catalog);
                                 formatted_ingredient.icon = catalog.icon;
                                 formatted_ingredient.name = i18n.t(catalog.display_name);
                                 if (catalog.root_entity_uri) {
                                     formatted_ingredient.identifier = catalog.root_entity_uri;
                                     formatted_ingredient.available = radiant.findUsableCount(formatted_ingredient, self.usableInventoryTracker);
                                     if (current_item.uri != catalog.root_entity_uri) {
                                        var escapedUri = current_item.uri.replace('.json', '&#46;json');
                                        if (self.usableInventoryTracker[escapedUri]) {
                                           formatted_ingredient.available = self.usableInventoryTracker[escapedUri].count;
                                        }
                                     }
                                     //formatted_ingredient.uri = current_item.uri.replace('_iconic','');
                                     formatted_ingredient.uri = current_item.uri;
                                     $(ingredientDiv).find('.numHave').text(formatted_ingredient.available);
                                 } else {
                                     formatted_ingredient.available = radiant.findUsableCount(formatted_ingredient, self.usableInventoryTracker);
                                     formatted_ingredient.uri = current_item.uri;
                                     $(ingredientDiv).find('.numHave').text(formatted_ingredient.available);
                                 }
                             }
                         } else {
                             console.log("no ingredient uri " + recipe_key);
                         }
                     }
                     i = i + 1;
                 });
             }
         }
         var rows = self.$('#itemCountDisplay .row').each(function(index) {
             var row = $(this);
             var scoreName = row.attr('id');
             var tooltipString = App.tooltipHelper.getTooltip(scoreName, null, true); // True for town description.
             if (tooltipString) {
                 row.tooltipster({
                     content: $(tooltipString)
                 });
             }
         });
         
         this._updateUi();
     },
     willDestroyElement: function() {
         var self = this;
         this._inventoryPalette.stonehearthItemPalette('destroy');
         this._inventoryPalette = null;
     },
     addToArray: function(item, user_items) {
         var self = this
         var recipe = this.getTrackedItems();
         var id = $(item).attr('uri');
         event.stopPropagation();
         var existing_items = recipe["ingredients"];

         function itemExists(item) {
             return existing_items.some(function(el) {
                 return el.uri === item;
             });
         }
         if (itemExists(id)) {
             console.log("Already exists!");
         } else {
             recipe["ingredients"].push({ 'uri': id });
             this.set('TrackedItems', recipe);
             this.propertyDidChange('TrackedItems');
         }
     },
     removeFromArray: function(item, user_items) {
         var self = this
         var recipe = this.getTrackedItems();
         var id = $(item).attr('data-identifier');
         var removeByAttr = function(arr, attr, value) {
             var i = arr.length;
             while (i--) {
                 if (arr[i] &&
                     arr[i].hasOwnProperty(attr) &&
                     (arguments.length > 2 && arr[i][attr] === value)) {
                     arr.splice(i, 1);
                 }
             }
             return arr;
         }
         removeByAttr(recipe["ingredients"], 'uri', id);
         this.set('TrackedItems', recipe);
         this.propertyDidChange('TrackedItems');
     },
     _updateUi: function() {
         var self = this;
         // Update net worth
         var netWorthLevel = self.get('score_data.net_worth.level');
         // Update happiness score
         self._updateHappinessScore();
         var setValueFloored = function(key_name, value) {
             if (!value) {
                 value = 0;
             }
             self.set(key_name, Math.floor(value));
         };
         setValueFloored('net_worth', self.get('score_data.total_scores.net_worth'));
         setValueFloored('edibles', self.get('score_data.total_scores.edibles'));
     },
     _updateHappinessScore: function() {
         var self = this;
         var scoreValue = self.get('score_data.median.happiness');
         if (!scoreValue) {
             return;
         }
         var moodNumber = Math.round(scoreValue);
         var moodString, icon;
         $.each(App.happinessConstants.mood_data, function(mood, data) {
             if (data.score == moodNumber) {
                 moodString = mood;
                 icon = data.icon;
             }
         });
         if (!moodString) {
             console.log('no mood found in happiness constants matching a happiness score of ', moodNumber);
         }
         self.set('morale_icon_style', 'background-image: url(' + icon + ')');
         // Set the tooltip for the bar
         var tooltipString = App.tooltipHelper.getTooltip(moodString, null, true); // True for town description.
         var moraleBanner = $('#moraleBanner');
         if (tooltipString) {
             // Remove old mood tooltip if it exists
             if (moraleBanner.hasClass('tooltipstered')) {
                 moraleBanner.tooltipster('destroy');
             }
             moraleBanner.tooltipster({
                 content: $(tooltipString)
             });
         }
     },
     _setIconClass: function(className, value) {
         var iconValue = Math.floor(value / 10); // value between 1 and 10
         this.set(className, 'happiness_' + iconValue);
     },
     _observerScores: function() {
         this._updateUi();
     }.observes('score_data.happiness'),
     _updateMeter: function(element, value, text) {
         element.progressbar({
             value: value
         });
         element.find('.ui-progressbar-value').html(text.toFixed(1));
     },
 });