function Generator(){
}

Generator.prototype.generateMapping = function(schema, cb){
  var cleanTree = getCleanTree(schema.tree, schema.paths, '');
  delete cleanTree[schema.get('versionKey')];
  var mapping = getMapping(cleanTree, '');
  cb(null, { properties: mapping, dynamic: schema.options.es_dynamic || false });
};

module.exports = Generator;



//
// Generates the mapping
//
// Can be called recursively.
//
// @param cleanTree
// @param prefix
// @return the mapping
//
function getMapping(cleanTree, prefix) {
  var mapping = {},
      value = {},
      implicitFields = [],
      hasEs_index = false;

  if (prefix !== '') {
    prefix = prefix + '.';
  }

  for (var field in cleanTree) {
    value = cleanTree[field];
    mapping[field] = {};
    mapping[field].type = value.type;

    // Check if field was explicity indexed, if not keep track implicitly
    if(value.es_indexed) {
      hasEs_index = true;
    } else if (value.type) {
      implicitFields.push(field);
    }


    // If there is no type, then it's an object with subfields.
    if (!value.type) {
      mapping[field].type = 'object';
      mapping[field].properties = getMapping(value, prefix + field);
      continue;
    }

    // Else, it has a type and we want to map that
    for (var prop in value) {
      // Map to field if it's an Elasticsearch option
      if (prop.indexOf('es_') === 0 && prop !== 'es_indexed') {
        mapping[field][prop.replace(/^es_/, '')] = value[prop];
      }
    }

	if(value.es_type) continue;

    // If it is a objectid make it a string.
    if(value.type === 'objectid'){
      mapping[field].type = 'string';
      continue;
    }

    //If indexing a number, and no es_type specified, default to double
    if (value.type === 'number' && value['es_type'] === undefined) {
      mapping[field].type = 'double';
      continue;
    }

  }

  //If one of the fields was explicitly indexed, delete all implicit fields
  if (hasEs_index) {
    implicitFields.forEach(function(field) {
      delete mapping[field];
    });
  }

  return mapping;
}


//
// Generates a clean tree
//
// Can be called recursively.
//
// @param tree
// @param paths
// @param prefix
// @return the tree
//
function getCleanTree(tree, paths, prefix) {

  var cleanTree = {},
      type = '',
      value = {};

  if (prefix !== '') {
    prefix = prefix + '.';
  }

  for (var field in tree){
    if (prefix === '' && (field === "id" || field === "_id")) {
      continue;
    }

    type = getTypeFromPaths(paths, prefix + field);
    value = tree[field];

    if(value.es_indexed === false) {
      continue;
    }
    // Field has some kind of type
    if (type) {
      // If it is an nested schema
      if (value[0]) {
        // A nested array can contain complex objects
        if (paths[field].schema && paths[field].schema.tree && paths[field].schema.paths) {
          cleanTree[field] = getCleanTree(paths[field].schema.tree, paths[field].schema.paths, '');
        } else if ( paths[field] && paths[field].caster && paths[field].caster.instance ) {
          // Even for simple types the value can be an object if there is other attributes than type
          if(typeof value[0] === 'object'){
            cleanTree[field] = value[0];
          } else {
            cleanTree[field] = {};
          }
          cleanTree[field].type = paths[field].caster.instance.toLowerCase();
        } else if (!paths[field] && prefix) {
          if(paths[prefix + field] && paths[prefix + field].caster && paths[prefix + field].caster.instance) {
            cleanTree[field] = {type: paths[prefix + field].caster.instance.toLowerCase()};
          }
        } else {
          cleanTree[field] = {
            type:'object'
          };
        }
      } else if (value === String || value === Object || value === Date || value === Number || value === Boolean || value === Array){
        cleanTree[field] = {};
        cleanTree[field].type = type;
      } else {
        cleanTree[field] = value;
        cleanTree[field].type = type;
      }

    // It has no type for some reason
    } else {
      // Because it is an geo_* object!!
      if (typeof value === 'object')
      {
        var key;
        var geoFound = false;
        for (key in value) {
          if (value.hasOwnProperty(key) && /^geo_/.test(key)) {
              cleanTree[field] = value[key];
              geoFound = true;
              //break;
            }
        } 
        if(geoFound) continue
      }

      // If it's a virtual type, don't map it
      if (typeof value === 'object' && value.getters && value.setters && value.options) {
        continue;
      }

      // Because it is some other object!! Or we assumed that it is one.
      if (typeof value === 'object') {
        cleanTree[field] = getCleanTree(value, paths, prefix + field);
      }
    }
  }

  return cleanTree;
}



//
// Get type from the mongoose schema
//
// Returns the type, so in case none is set, it's the mongoose type.
//
// @param paths
// @param field
// @return the type or false
//
function getTypeFromPaths(paths, field) {
  var type = false;

  if (paths[field] && paths[field].options.type === Date) {
    return 'date';
  }

  if (paths[field] && paths[field].options.type === Boolean) {
    return 'boolean';
  }

  if (paths[field]) {
    type = paths[field].instance ? paths[field].instance.toLowerCase() : 'object';
  }

  return type;
}
