// Pipedemo - Web Edition


var pdw = {
  count: 0,
  done: 0,
  asleep: true,
  events: [],             // Asynchronous event queue
  myDiagram: null,        // Root for GoJS objects
  last: {},               // Other port to connect to
  group: "",
  syntax: "",             // Current syntax exit for msgs

  enqueue(msg) {
    this.events.push(msg)
  },

  dequeue() {
    return this.events.shift()
  },

  proc() {
    var m = pdw.myDiagram.model;
    var $ = go.GraphObject.make;

    var state = [];
    state["start_stage"]  = { color: "#084B8A", delay: 500 };
    state["resume_stage"] = { color: "#FF0000", delay: 250 };
    state["dispatcher"]   = { color: "#2ECCFA", delay: 250 };
    state["end_stage"]    = { color: "blue",    delay: 500 };

    function isEmpty(obj) {
      return (Object.keys(obj).length == 0);
    }

    function addPort(node, inp, nr) {
      var ports = inp ? node.inputs : node.outputs;
      if (nr === undefined) {
        nr = ports.length;        // Assume to add an entry
        for (var i=0; i < ports.length; i++) {
          if (ports[i] === undefined) {   // Found a free slot
            nr = i;
            break;
          }
        }
      };
      var sym = (inp ? "i" : "o") + nr.toString();
      var p = $(go.Shape, "Rectangle", { portId: sym });
      if (nr >= ports.length) nr = -1;
      m.insertArrayItem(ports, nr, p);
      return sym;
    }

    function mkLink(ld) {
      var group = pdw.group;
      if (group != '') {
        var grp = m.findNodeDataForKey(group);
        grp.children.push({ typ: 'link', obj: ld })
      }
      m.addLinkData(ld)
    }

    // ****   do_stage  ****
    // Handle creation of a new stage in the topology. The global
    // variable 'group' shows whether we are building inside a
    // subroutine pipeline.

    function do_stage(doc) {
      var s = doc.verb;
      if (s == '') {
        s = '[' + doc.parm.split(' ')[0] + ']';
      }
      var group = pdw.group;
      var node = {
        key: doc.id,
        name: ((doc.label.length != 0) ? doc.label + ': ' : '') + s,
        category: "stage",
        group: group,
        inputs: [],
        outputs: []
      };
      m.addNodeData(node);
      if (group != "") {
        var grp = m.findNodeDataForKey(group);
        grp.children.push({ typ: 'node', obj: node });
      }

      // Create a link to the last place we remembered. If the port
      // is not known, we know we must still add one to the node.

      var last = pdw.last;
      if (!isEmpty(last)) {
        var po = (last.port == "") ? addPort(last.node, false) : last.port;
        var pi = addPort(node, true);
        var ld = {
          from: last.node.key,
          fromPort: po,
          to: node.key,
          toPort: pi
        }
        mkLink(ld);
      };

      // Remember that we're the one to connect the next stage to.
      // The port is not defined, so additional ports will be created
      // to fit our needs.

      pdw.last = { node: node, port: "" };
    }

    // do_cons_out - Create balloon if needed and insert the text

    function do_cons_out(doc) {
      var consout = m.findNodeDataForKey("cons");
      if (consout == null) {
        m.addNodeData({ key: "cons", category: "cons", cons: []});
        consout = m.findNodeDataForKey("cons");

  //    mkLink({ from: "cons", to: doc.id, category: "balloon" });
      };

      // TextBlock is trimming leading whitespace which messes up my
      // nicely formatted display. A \u00ad (soft hyphen) at the start
      // fools the trimming process.

      var cons = consout.cons;
      var line = doc.txt.substring(0,80);     // Truncate output lines
      cons.push('> ' + line);                 // Avoid trimming
      if (cons.length > 12) { cons.splice(0,1); }  // Keep last lines
      consout.cons = cons;
      txt = cons.join('\n');                  // Make text string
      m.setDataProperty(consout, "text", txt);
    }

    // ****   do_connect    ****
    // Handle connectors in the scanner. This is within a subroutine
    // pipeline, and 'id' is the key for the group we connect in.
    // Initially, the group does not have any ports to connect to. The
    // connector specifies the number of the stream, which means that
    // we must create the port with that number.

    function do_connect(doc) {
      var inp = (doc.flag == 1);
      var pid = (inp ? "i" : "o") + doc.streamnum.toString();
      var sub = m.findNodeDataForKey(doc.id);
      addPort(sub, inp, doc.streamnum);    // Add port to connect to
      var last = pdw.last;

      if (inp) {           // Input connector
        last = {                    // Just remember where to connect to
          node: m.findNodeDataForKey(doc.id),
          port: pid
        };
      }
      else {                          // Output connector
        ld = {
          from: last.node.key,
          fromPort: last.port == "" ? addPort(last.node, false): last.port,
          to: doc.id, toPort: pid
        };
        mkLink(ld);
        last = {};
      };
      pdw.last = last
    }

    // ****    do_sub_start     ****
    // Handle birth of a subroutine like a callpipe. We create a group
    // node to associate all following stages with.

    function do_sub_start(doc) {
      var sub = {                 // of most recently dispatched stage
          key: doc.id,
          group: "",
          isGroup: true,
          alive: true,
          name: doc.name,
          children: [],         // Child nodes and links inside
          inputs: [],
          outputs: []
        };
      pdw.myDiagram.model.addNodeData(sub);
      pdw.group = doc.id;           // Remember group to add stages to
    };

    // ****   do_sub_wait     ****
    // The subroutine has already been created, and any ports that
    // it uses have been defined. We now need to connect the links
    // from the old stage to this new subroutine stage.

    function do_sub_wait(doc) {
      // Go through inputs and outputs to define ports for any links
      // to the old stage for which we have no port yet.

      var node = m.findNodeDataForKey(doc.id);      // Caller stage
      var sub = m.findNodeDataForKey(doc.refid);    // callee
      m.setDataProperty(sub, "parent", doc.id);

      for (var i in node.inputs) {    // Define missing input ports
        var pi = sub.inputs[i];
        if (pi === undefined) pi = addPort(sub, true, i);
      }
      for (var i in node.outputs) {   // Define missing output ports
        var po = sub.outputs[i];
        if (po === undefined) po = addPort(sub, false, i);
      }

      for (var i in m.linkDataArray) {
        var ld = m.linkDataArray[i];
        if (ld.to == node.key) {
          m.setDataProperty(ld, "to", sub.key);
        }
        else {
          if (ld.from == node.key) {
            m.setDataProperty(ld, "from", sub.key);
          }
        }
      }
      m.setDataProperty(node, "visible", false);
    };

    function do_sub_end(doc) {
      var sub = m.findNodeDataForKey(doc.id);
      var node = m.findNodeDataForKey(sub.parent);
      m.setDataProperty(node, "visible", true);

      for (var i in m.linkDataArray) {
        var ld = m.linkDataArray[i];
        if (ld.to == sub.key) {
          if (ld.toPort[0] == 'i') m.setDataProperty(ld, "to", node.key)
          else m.removeLinkData(ld)
         }
        else {
          if (ld.from == sub.key) {
            if (ld.fromPort[0] == 'o') m.setDataProperty(ld, "from", node.key)
            else m.removeLinkData(ld)
          }
        }
      };

      for (var i in sub.children) {
        var obj = sub.children[i];
        switch (obj.typ) {
          case 'link':
            m.removeLinkData(obj.obj);
            break;
          case 'node':
            m.removeNodeData(obj.obj);
        }
      }
      m.removeNodeData(sub);
    };

    function do_animate(doc) {
      var node = m.findNodeDataForKey(doc.id);
      var delay = 0;
      var animate = true;
      if (node != null) {             // Stage in subroutine
        if (node.group != "") {
          var grp = m.findNodeDataForKey(node.group);
          animate = grp.alive;
        }
        m.setDataProperty(node, "color", state[doc.evt].color);
        if (animate) {
          delay = state[doc.evt].delay
        }
      };
      return delay
    }

    function do_message(doc) {
      var s = doc.id + '-msg';
      var node = m.findNodeDataForKey(doc.id);
      if (node == null) {
        var popup = {
          key: s,
          category: "cons",
          stroke: "yellow",
          cons: []
        }
        m.addNodeData(popup);
        node = m.findNodeDataForKey(s);
        var ref = (doc.id != '00000000') ? doc.id : pdw.syntax;
        if (ref != '00000000') {
          mkLink({ from: s, to: doc.id, category: "balloon" });
        }
      };
      var cons = node.cons;
      var line = doc.msg.substring(0,79);     // Truncate output lines
      cons.push('\u00ad' + line);                 // Avoid trimming
      if (cons.length > 8) { cons.splice(0,1); }  // Keep last lines
      txt = cons.join('\n');                  // Make text string
      m.setDataProperty(node, "text", txt);
    }

    function do_event(doc) {
        var delay = 200;
        var m = pdw.myDiagram.model;
        switch (doc.evt) {
          case "message":
            do_message(doc);
            break;
          case "begin_set":
            pdw.group = "";
            break;
          case "enter_scanner":
            pdw.last = {};
            break;
          case "vector_allocated":
            if (doc.func != 0) {        // Subroutine pipeline takes place
              do_sub_start(doc);
            }
            break;
          case "scan_begin":
            pdw.last = {};
            break;
          case "scan_labelref":
            var ref = m.findNodeDataForKey(doc.refid);
            var pid = "";
            var last = pdw.last;
            if (!isEmpty(last)) {
              var po = addPort(last.node, false);
              var pi = addPort(ref, true);
              mkLink({
                from: last.node.key, fromPort: po,
                to: ref.key, toPort: pi });
            }
            pdw.last = { node: ref, port: pid };
            break;
          case "scan_stage":
            do_stage(doc);
            break;
          case "scan_connect":
            do_connect(doc);
            break;
          case "syntax":
            pdw.syntax = doc.id;
            break;
          case "leave_scanner":
//            group = "";
            pdw.syntax = "";
            delay = 1000;
            break;
          case "start_stage":
          case "resume_stage":
          case "dispatcher":
          case "end_stage":
            delay = do_animate(doc);
            break;
          case "cons_out":
            do_cons_out(doc)
            break;
          case "caller_wait":
            do_sub_wait(doc);
            break;
          case "subroutine_end":
            do_sub_end(doc);
            break;
          case "stalled":
            var tmp = { id: '00000000', msg: 'Pipeline Stalled' };
            do_message(tmp);
            break;
        };
        return delay
    }

    if (pdw.events.length > 0) {
        var delay = 0;
        var text = this.dequeue().trim();
        pdw.done += 1;
//      var doc = document.getElementById("data");
        if (text.length > 0) delay = do_event(JSON.parse(text));
    } else pdw.asleep = true;
    setTimeout('pdw.proc();', (pdw.events.length == 0) ? 500 : delay);
  },

  init() {
    var $ = go.GraphObject.make;
    this.myDiagram = $(go.Diagram, "myDiagramDiv",
      {
        initialContentAlignment: go.Spot.Center,  // Put content in the center
        layout: $(go.LayeredDigraphLayout,
            { direction: 90, layerSpacing: 15 }),
        "undoManager.isEnabled": false            // No transactions
      }
    );
    // Define the model to use GraphLinksModel and set the attribute names
    // for the portId when the nodeDataArray is defined. This mapping is
    // also used when links are added to the arrays.

    this.myDiagram.model = $(go.GraphLinksModel,
          { linkFromPortIdProperty: "fromPort",
            linkToPortIdProperty: "toPort" });

    // Define links to be drawn orthogonally and avoid the nodes.

    var pipeLinkTemplate = $(go.Link,
          { routing: go.Link.AvoidsNodes, corner: 3 },
          $(go.Shape, { strokeWidth: 3, stroke: "#6E6E6E" }),
          $(go.Shape, { toArrow: "NormalArrow" }));

    var balloonLinkTemplate = $(BalloonLink,
          $(go.Shape, { stroke: "green", fill: "lightyellow"}));

    // The template for a stage defines the rectangle with the text and
    // the arrangement for the ports on top and bottom. Since ports are
    // added during exectution, we define two empty arrays and template
    // for the items when added. The go.Binding is to set the portId of
    // the new port to the "name" attribute from the shape.
    // When those get messed up, links start from another port or from
    // a vague position between.

    function portArray(tag, numfr, numto) {
      return $(go.Panel, "Horizontal",
          { height: 5 , itemArray: [] },
          new go.Binding("itemArray", tag),
          { itemTemplate:
              $(go.Panel, "Auto",
                $(go.Shape, "Rectangle",
                    { toSpot: go.Spot.Top,
                      fromSpot : go.Spot.Bottom,
                      margin: new go.Margin(0,3),
                      fromMaxLinks: numfr, toMaxLinks: numto,
                      width: 8, height: 5,
                      fill: "red"
                    },
                    new go.Binding("portId", "portId")
                  )
                )
          }
      )
    };

    var stageTemplate =
      $(go.Node, "Vertical",
        { locationSpot: go.Spot.Center },
        new go.Binding("visible"),
        portArray("inputs", 0, 1),
        $(go.Panel, "Vertical",
          { background: "#084B8A", width: 100, height: 35 },
          $(go.TextBlock, "Stage", {
              verticalAlignment: go.Spot.Center,
              margin: 10, stroke: "white"
            },
            new go.Binding("text", "name")
          ),
          new go.Binding("background", "color")
        ),
        portArray("outputs", 1, 0)
      );

    var consTemplate =
      $(go.Node, { background: "black" },
        $(go.TextBlock,
          { stroke: "lightgreen",
            margin: 3,
            font: "12px monospace",
            spacingAbove: 2         // Undocumented line spacing
          },
          new go.Binding("stroke"),
          new go.Binding("text"))
      );

  // The group template is the framework for the callpipe and addpipe.
  // Define an array of ports at the top and at the bottom. These ports
  // take both inbound and outbound links, and represent the connectors
  // of the subroutine.

    function connArray(tag) {
      return $(go.Panel, "Horizontal",
        new go.Binding("itemArray", tag),
        { itemTemplate:
            $(go.Panel, "Auto",
              $(go.Shape, "Rectangle",
                  { toSpot: go.Spot.Top,
                    fromSpot: go.Spot.Bottom,
                    margin: new go.Margin(0,3),
                    fromMaxLinks: 1, toMaxLinks: 1,
                    width: 8, height: 5,
                    fill: "red"},
                  new go.Binding("portId", "portId")))})
    }

    var groupTemplate =
      $(go.Group, "Vertical",
          { locationSpot: go.Spot.Center,
            layout: $(go.LayeredDigraphLayout,
              { direction: 90, layerSpacing: 15 })},
          new go.Binding("isSubGraphExpanded", "alive").makeTwoWay(),
        $(go.Panel, "Vertical", // { minSize: new go.Size(120, 30) },
            portArray("inputs", 1, 1),
            $(go.Panel, "Auto",
              $(go.Shape, "RoundedRectangle",
                { strokeWidth: 0.5, stroke: "blue", fill: "#c1eff2" }),
              $(go.Panel, "Horizontal", { alignment: new go.Spot(0,0,0,5) },
                $("SubGraphExpanderButton", {
                    margin: new go.Margin(0,3,5,0)}),
                $(go.TextBlock, "Sub",
                    { stroke: "blue", font: "10px sans-serif" },
                  new go.Binding("text", "name"))),
              $(go.Placeholder, { margin: 15, padding: 5 })),
            portArray("outputs", 1, 1)));

      var tmpmap = new go.Map("string", go.Node);
      tmpmap.add("stage", stageTemplate);
      tmpmap.add("cons", consTemplate);
      tmpmap.add("", this.myDiagram.nodeTemplate);

      this.myDiagram.nodeTemplateMap = tmpmap;
      this.myDiagram.groupTemplate = groupTemplate;

      var lnkmap = new go.Map("string", go.Link);
      lnkmap.add("balloon", balloonLinkTemplate);
      lnkmap.add("", pipeLinkTemplate);
      this.myDiagram.linkTemplateMap = lnkmap;


  },

// **** run ****


  run(arg) {

    function fillarea(cmdarea, url) {
      var xhr = new XMLHttpRequest;
      xhr.open('GET', url, true);
      xhr.onload = function(e) {
        cmdarea.value = xhr.responseText
      }
      xhr.send()
    }

    var cmdarea = document.getElementById("cmdline");
    if (arg == undefined) {
      var line = cmdarea.value;
      url = "events?" + encodeURIComponent(line);
    } else {
      fillarea(cmdarea, arg + ".txt");
      url = arg + ".json"
    }
    var m = pdw.myDiagram.model;

    while (m.linkDataArray.length > 0) {
      m.removeLinkData(m.linkDataArray[0])
    };
    while (m.nodeDataArray.length > 0) {
      m.removeNodeData(m.nodeDataArray[0])
    };

    pdw.asleep = true;
    var ix = 0;       // Characters processed so far
    var xhr = new XMLHttpRequest;
    xhr.open('GET', url, true);
    xhr.onprogress = function(e) {
      if (this.status == 200) {
          var data = this.responseText;
          do {
            var len = data.substr(ix).indexOf('\n');
            if (len < 0) break;
            var line = data.substr(ix,len);
            ix += len + 1;
            pdw.enqueue(line);
            pdw.count += 1;
          } while (true);

          // for (var i in data) {
          //     pdw.enqueue(data[i]);
          //     pdw.count += 1
          //   };
          // tot += msg.length;
          if (pdw.asleep) {
            if (pdw.count > pdw.done) {
              pdw.asleep = false;
              setTimeout(pdw.proc(), 0);
            }
          }

        }
      };

    xhr.send();

  }

}
